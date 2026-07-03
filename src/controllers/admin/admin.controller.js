const adminService = require('../../services/admin/admin.service');
const asyncHandler = require('../../utils/asyncHandler');

const getAll = asyncHandler(async (req, res) => {
  const { search, role, page, limit } = req.query;
  const result = await adminService.getAllAdmins({ search, role }, { page, limit });
  res.status(200).json({ success: true, message: result.message, data: { administrateurs: result.administrateurs, pagination: result.pagination } });
});

const getOne = asyncHandler(async (req, res) => {
  const result = await adminService.getAdminById(req.params.id);
  res.status(200).json({ success: true, message: result.message, data: { administrateur: result.administrateur } });
});

const create = asyncHandler(async (req, res) => {
  const result = await adminService.createAdmin(req.body, req.user.id);
  res.status(201).json({ success: true, message: result.message, data: { administrateur: result.administrateur } });
});

const update = asyncHandler(async (req, res) => {
  const result = await adminService.updateAdmin(req.params.id, req.body, req.user.id);
  res.status(200).json({ success: true, message: result.message, data: { administrateur: result.administrateur } });
});

module.exports = { getAll, getOne, create, update };
