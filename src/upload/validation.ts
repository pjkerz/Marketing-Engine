import multer from 'multer';
import * as path from 'path';
import * as os from 'os';

export const resumeUpload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.pdf' || ext === '.docx') {
      cb(null, true);
    } else {
      cb(new Error('UPLOAD_INVALID_TYPE'));
    }
  },
});
