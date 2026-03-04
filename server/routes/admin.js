const express = require('express');
const router = express.Router();
const { authMiddleware, isAdmin } = require('../middleware/auth');
const { getSections, updateSection, createSection } = require('../controllers/cmsController');

// All admin routes are protected
router.use(authMiddleware);

// CMS Content management
router.get('/sections', getSections);
router.post('/sections', createSection);
router.put('/sections/:id', updateSection);

module.exports = router;
