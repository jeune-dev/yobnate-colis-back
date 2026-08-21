const adminService = require('../../services/admin/admin.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');

exports.getAll = asyncHandler(async (req, res) => {
  const { search, role, page, limit } = req.query;
  const result = await adminService.getAllAdmins({ search, role }, { page, limit });
  return ok(
    res,
    { administrateurs: result.administrateurs, pagination: result.pagination },
    result.message
  );
});

exports.getOne = asyncHandler(async (req, res) => {
  const result = await adminService.getAdminById(req.params.id);
  return ok(res, { administrateur: result.administrateur }, result.message);
});

exports.create = asyncHandler(async (req, res) => {
  const result = await adminService.createAdmin(req.body, req.user.id);
  return created(res, { administrateur: result.administrateur }, result.message);
});

exports.update = asyncHandler(async (req, res) => {
  const result = await adminService.updateAdmin(req.params.id, req.body, req.user.id);
  return ok(res, { administrateur: result.administrateur }, result.message);
});
