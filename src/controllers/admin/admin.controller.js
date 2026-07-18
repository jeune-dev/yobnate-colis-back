const adminService = require('../../services/admin/admin.service');
const asyncHandler = require('../../middlewares/asyncHandler');
const { ok, created } = require('../../utils/response');
const { BadRequestError, NotFoundError, ConflictError, UnauthorizedError, ForbiddenError } = require('../../errors/AppError');

const getAll = asyncHandler(async (req, res) => {
  const { search, role, page, limit } = req.query;
  const result = await adminService.getAllAdmins({ search, role }, { page, limit });
  return ok(res, { administrateurs: result.administrateurs, pagination: result.pagination }, result.message);
});

const getOne = asyncHandler(async (req, res) => {
  const result = await adminService.getAdminById(req.params.id);
  return ok(res, { administrateur: result.administrateur }, result.message);
});

const create = asyncHandler(async (req, res) => {
  const result = await adminService.createAdmin(req.body, req.user.id);
  return created(res, { administrateur: result.administrateur }, result.message);
});

const update = asyncHandler(async (req, res) => {
  const result = await adminService.updateAdmin(req.params.id, req.body, req.user.id);
  return ok(res, { administrateur: result.administrateur }, result.message);
});

module.exports = { getAll, getOne, create, update };
