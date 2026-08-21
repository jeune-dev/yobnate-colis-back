/**
 * Rôles applicatifs et périmètre de chacun.
 * `agent_point` est rattaché à un point de collecte : il ne voit que les colis qui y transitent.
 * `coursier` est rattaché à un pays : il traite les enlèvements et les livraisons qui lui sont affectés.
 */
const ROLES = ['client', 'coursier', 'agent_point', 'admin', 'super_admin'];

const ROLES_PERSONNEL = ['coursier', 'agent_point', 'admin', 'super_admin'];
const ROLES_ADMIN = ['admin', 'super_admin'];
const ROLES_OPERATIONNELS = ['coursier', 'agent_point', 'admin', 'super_admin'];

const LIBELLES_ROLES = {
  client: 'Client',
  coursier: 'Coursier',
  agent_point: 'Agent de point de collecte',
  admin: 'Administrateur',
  super_admin: 'Super administrateur',
};

const estAdmin = (role) => ROLES_ADMIN.includes(role);

module.exports = {
  ROLES,
  ROLES_PERSONNEL,
  ROLES_ADMIN,
  ROLES_OPERATIONNELS,
  LIBELLES_ROLES,
  estAdmin,
};
