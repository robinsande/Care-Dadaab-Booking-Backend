const express = require('express');
const campController = require('../controllers/camp.controller');
const blockController = require('../controllers/block.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { anyStaff, superAdminOnly } = require('../middleware/role.middleware');
const { validate } = require('../middleware/validate.middleware');
const { mongoIdParam } = require('../validators/common.validator');
const { createCampRules, updateCampRules } = require('../validators/camp.validator');
const { createBlockRules, updateBlockRules } = require('../validators/block.validator');

const router = express.Router();

router.use(authenticate);

router.get('/', anyStaff, campController.listCamps);
router.get('/:id', anyStaff, validate([mongoIdParam('id')]), campController.getCamp);

router.post('/', superAdminOnly, validate(createCampRules), campController.createCamp);
router.put(
  '/:id',
  superAdminOnly,
  validate([mongoIdParam('id'), ...updateCampRules]),
  campController.updateCamp
);
router.delete('/:id', superAdminOnly, validate([mongoIdParam('id')]), campController.deleteCamp);

router.get(
  '/:campId/blocks',
  anyStaff,
  validate([mongoIdParam('campId')]),
  blockController.listBlocks
);
router.post(
  '/:campId/blocks',
  superAdminOnly,
  validate([mongoIdParam('campId'), ...createBlockRules]),
  blockController.createBlock
);

router.get(
  '/:campId/blocks/:blockId',
  anyStaff,
  validate([mongoIdParam('campId'), mongoIdParam('blockId')]),
  blockController.getBlock
);
router.put(
  '/:campId/blocks/:blockId',
  superAdminOnly,
  validate([mongoIdParam('campId'), mongoIdParam('blockId'), ...updateBlockRules]),
  blockController.updateBlock
);
router.delete(
  '/:campId/blocks/:blockId',
  superAdminOnly,
  validate([mongoIdParam('campId'), mongoIdParam('blockId')]),
  blockController.deleteBlock
);

module.exports = router;
