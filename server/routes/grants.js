import express from 'express';
import { createGrant, getGrants, updateGrantStatus } from '../controllers/grantsController.js';

const router = express.Router();

// GET all grants (used by Mission Control VIP Kanban)
router.get('/', getGrants);

// POST a new grant (used by n8n scraper workflow)
router.post('/', createGrant);

// PUT/PATCH to update status (used by Kanban drag-and-drop)
router.put('/:id/status', updateGrantStatus);
router.patch('/:id/status', updateGrantStatus);

export default router;
