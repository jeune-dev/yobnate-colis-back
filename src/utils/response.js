const ok = (res, data, message = 'Succès', status = 200) =>
  res.status(status).json({ success: true, message, data });

const created = (res, data, message = 'Créé avec succès') =>
  res.status(201).json({ success: true, message, data });

module.exports = { ok, created };
