const express = require('express');
const roomController = require('../controllers/room.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { anyStaff, superAdminOnly } = require('../middleware/role.middleware');
const { validate } = require('../middleware/validate.middleware');
const { mongoIdParam } = require('../validators/common.validator');
const {
  createRoomRules,
  updateRoomRules,
  listAvailableRoomsRules,
} = require('../validators/room.validator');

const router = express.Router();

router.use(authenticate);

router.get('/available', anyStaff, validate(listAvailableRoomsRules), roomController.listAvailableRooms);
router.get('/', anyStaff, roomController.listRooms);
router.get('/:id', anyStaff, validate([mongoIdParam('id')]), roomController.getRoom);

router.post('/', superAdminOnly, validate(createRoomRules), roomController.createRoom);
router.put(
  '/:id',
  superAdminOnly,
  validate([mongoIdParam('id'), ...updateRoomRules]),
  roomController.updateRoom
);
router.delete('/:id', superAdminOnly, validate([mongoIdParam('id')]), roomController.deleteRoom);

module.exports = router;
