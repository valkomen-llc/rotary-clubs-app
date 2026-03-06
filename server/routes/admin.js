const express = require('express');
const router = express.Router();
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { getSections, updateSection, createSection } = require('../controllers/cmsController');
const { getAllClubs, createClub, updateClub, deleteClub } = require('../controllers/clubController');

// All admin routes are protected
router.use(authMiddleware);

// --- SUPER ADMIN ROUTES ---
const superAdminOnly = roleMiddleware(['administrator']);

router.get('/clubs', superAdminOnly, getAllClubs);
router.post('/clubs', superAdminOnly, createClub);
router.put('/clubs/:id', superAdminOnly, updateClub);
router.delete('/clubs/:id', superAdminOnly, deleteClub);

// --- CLUB ADMIN & SUPER ADMIN ROUTES ---
const adminRoles = ['administrator', 'club_admin'];

// CMS Content management
router.get('/sections', roleMiddleware(adminRoles), getSections);
router.post('/sections', roleMiddleware(adminRoles), createSection);
router.put('/sections/:id', roleMiddleware(adminRoles), updateSection);

module.exports = router;
