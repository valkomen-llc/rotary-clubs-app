import db from '../../lib/prisma.js';
import { resolveClubId } from '../crmController.js';

// Reusable logic to build the WHERE clause based on UI filters
const buildWhereClause = (clubId, filterPayload) => {
  const where = { clubId };
  if (!filterPayload) return where;
  
  const { search, tags, lists, status } = filterPayload;
  
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
    ];
  }
  
  if (status) {
    where.status = status;
  }
  
  if (tags && tags.length > 0) {
    where.tags = { hasSome: Array.isArray(tags) ? tags : tags.split('|||') };
  }
  
  if (lists && lists.length > 0) {
    where.listMemberships = {
      some: { listId: { in: Array.isArray(lists) ? lists : lists.split('|||') } }
    };
  }
  
  return where;
};

// 1. Initialize Bulk Action
export const initBulkAction = async (req, res) => {
  try {
    const clubId = await resolveClubId(req, true);
    const { actionType, actionPayload, selectionMode, contactIds, filterPayload } = req.body;
    
    let totalItems = 0;
    
    // Si selectionMode === 'global', usamos el filterPayload para saber a cuántos aplicará
    if (selectionMode === 'global') {
       const where = buildWhereClause(clubId, filterPayload);
       totalItems = await db.crmContact.count({ where });
    } else {
       // Selección explícita
       totalItems = Array.isArray(contactIds) ? contactIds.length : 0;
    }
    
    if (totalItems === 0) {
       return res.status(400).json({ error: 'No se encontraron contactos para esta acción.' });
    }
    
    const job = await db.crmBulkJob.create({
      data: {
         clubId,
         actionType,
         status: 'pending',
         totalItems,
         processedItems: 0,
         actionPayload: actionPayload || {},
         filterPayload: selectionMode === 'global' ? filterPayload : null,
         contactIds: selectionMode === 'explicit' ? contactIds : null
      }
    });
    
    res.json({ success: true, job });
  } catch (error) {
    console.error('Error initBulkAction:', error);
    res.status(500).json({ error: error.message });
  }
};

// 2. Process a chunk of the Bulk Action
export const processChunk = async (req, res) => {
  try {
    const clubId = await resolveClubId(req, true);
    const { jobId } = req.body;
    const CHUNK_SIZE = 250; // Para no exceder limites Serverless
    
    const job = await db.crmBulkJob.findUnique({ where: { id: jobId } });
    if (!job || job.clubId !== clubId) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    if (job.status === 'completed' || job.status === 'failed') {
      return res.json({ success: true, job });
    }
    
    // Cambiar a processing si estaba pending
    if (job.status === 'pending') {
      await db.crmBulkJob.update({ where: { id: jobId }, data: { status: 'processing' } });
    }
    
    // Obtener los IDs a procesar en este lote
    let targetIds = [];
    
    if (job.contactIds && Array.isArray(job.contactIds)) {
       // Si es explícito, tomamos el chunk basado en processedItems
       targetIds = job.contactIds.slice(job.processedItems, job.processedItems + CHUNK_SIZE);
    } else if (job.filterPayload) {
       // Si es global (basado en filtros), consultamos la BD. 
       // Usamos skip = processedItems (excepto si estamos borrando registros)
       const where = buildWhereClause(clubId, job.filterPayload);
       const skipAmount = job.actionType === 'delete' ? 0 : job.processedItems;
       
       const contacts = await db.crmContact.findMany({
         where,
         select: { id: true },
         skip: skipAmount,
         take: CHUNK_SIZE,
         orderBy: { createdAt: 'desc' } // Mismo orden que en la vista
       });
       targetIds = contacts.map(c => c.id);
    }
    
    if (targetIds.length === 0) {
       // Terminamos
       const completedJob = await db.crmBulkJob.update({
         where: { id: jobId },
         data: { status: 'completed' }
       });
       return res.json({ success: true, job: completedJob, completed: true });
    }
    
    // ======== EJECUTAR LA ACCIÓN ========
    const actionType = job.actionType;
    const payload = job.actionPayload || {};
    
    // Procesaremos el lote en paralelo o usando Prisma transacciones si aplica
    if (['add_tags', 'add_lists', 'assign_lists_tags'].includes(actionType)) {
      const { tags, lists } = payload; 
      
      if (tags && tags.length > 0) {
         const contacts = await db.crmContact.findMany({ where: { id: { in: targetIds } } });
         for (const c of contacts) {
           const updatedTags = [...new Set([...(c.tags || []), ...tags])];
           await db.crmContact.update({ where: { id: c.id }, data: { tags: updatedTags } });
         }
      }
      
      if (lists && lists.length > 0) {
         const dataToInsert = [];
         targetIds.forEach(contactId => {
           lists.forEach(listId => { dataToInsert.push({ contactId, listId }); });
         });
         await db.contactListMember.createMany({ data: dataToInsert, skipDuplicates: true });
      }
    } 
    else if (['remove_tags', 'remove_lists', 'remove_lists_tags'].includes(actionType)) {
      const { tags, lists } = payload;
      
      if (tags && tags.length > 0) {
         const contacts = await db.crmContact.findMany({ where: { id: { in: targetIds } } });
         for (const c of contacts) {
           const updatedTags = (c.tags || []).filter(t => !tags.includes(t));
           await db.crmContact.update({ where: { id: c.id }, data: { tags: updatedTags } });
         }
      }
      
      if (lists && lists.length > 0) {
         await db.contactListMember.deleteMany({
           where: { contactId: { in: targetIds }, listId: { in: lists } }
         });
      }
    }
    else if (actionType === 'change_status') {
      const { status } = payload;
      if (status) {
         await db.crmContact.updateMany({
           where: { id: { in: targetIds } },
           data: { status }
         });
      }
    }
    else if (actionType === 'delete') {
       // Cuidado con las relaciones cascade
       await db.crmContact.deleteMany({
         where: { id: { in: targetIds } }
       });
       // NOTA IMPORTANTE: Si es un borrado real (deleteMany) sobre contactos filtrados
       // al hacer delete, la query con OFFSET se descuadra porque la tabla se encoge.
       // En este caso, para DeleteGlobal, deberíamos no usar `skip` sino tomar siempre los primeros CHUNK_SIZE
       // Para resolverlo de forma segura, la query de arriba usó skip: job.processedItems,
       // por lo que si borramos, la próxima llamada skippeará registros!
       // Sin embargo, este es un caso borde. Lo manejaremos marcando "processedItems"
       // o ignorando el offset si es delete.
    }
    
    // Actualizar progreso
    const newProcessed = job.processedItems + targetIds.length;
    const isCompleted = newProcessed >= job.totalItems;
    
    const updatedJob = await db.crmBulkJob.update({
       where: { id: jobId },
       data: { 
         processedItems: newProcessed,
         status: isCompleted ? 'completed' : 'processing'
       }
    });
    
    res.json({ success: true, job: updatedJob, completed: isCompleted });

  } catch (error) {
    console.error('Error processChunk:', error);
    // Marcar como fallido en caso de error crítico
    if (req.body.jobId) {
       await db.crmBulkJob.update({
         where: { id: req.body.jobId },
         data: { status: 'failed', actionPayload: { error: error.message } }
       });
    }
    res.status(500).json({ error: error.message });
  }
};

// 3. Get Active Jobs
export const getActiveJobs = async (req, res) => {
  try {
    const clubId = await resolveClubId(req);
    const jobs = await db.crmBulkJob.findMany({
      where: { clubId, status: { in: ['pending', 'processing'] } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
