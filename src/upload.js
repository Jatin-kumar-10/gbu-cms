const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
const maxMb = Number(process.env.UPLOAD_MAX_MB || 2);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.mimetype] || 'bin';
    cb(null, crypto.randomBytes(8).toString('hex') + '.' + ext);
  },
});

function fileFilter(req, file, cb) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.mimetype)) {
    return cb(new Error('Only JPG, PNG or WEBP images are allowed.'));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: maxMb * 1024 * 1024 },
});

/** Returns the relative path ('uploads/xxx.jpg') to store in DB, or null if no file. */
function uploadedPath(file) {
  return file ? `uploads/${file.filename}` : null;
}

module.exports = { upload, uploadedPath };
