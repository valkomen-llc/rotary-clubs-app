import express from 'express';
import { createGrant, getGrants, updateGrantStatus, deleteGrant } from '../controllers/grantsController.js';

const router = express.Router();

// GET all grants (used by Mission Control VIP Kanban)
router.get('/', getGrants);

// POST a new grant (used by n8n scraper workflow)
router.post('/', createGrant);

// PUT/PATCH to update status (used by Kanban drag-and-drop)
router.put('/:id/status', updateGrantStatus);
router.patch('/:id/status', updateGrantStatus);

// DELETE a grant (used by Mission Control UI)
router.delete('/:id', deleteGrant);

export default router;
