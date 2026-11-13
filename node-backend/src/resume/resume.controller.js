const resumeService = require('./resume.service');
const Resume = require('../db/models/Resume.model');
const { ApiError } = require('../middlewares/errorHandler');
const logger = require('../utils/logger');

const uploadAndParseResume = async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'No resume file uploaded. Please upload a PDF file under the field "resumeFile".');
  }

  logger.info(`Received resume file: ${req.file.originalname}, size: ${req.file.size} bytes`);

  const resumeText = await resumeService.parsePdfResume(req.file.buffer);

  if (!resumeText || resumeText.trim().length === 0) {
    logger.warn(`Resume parsed but no text content found for file: ${req.file.originalname}`);
    return res.status(200).json({
      success: true,
      message: 'Resume processed. Warning: No text content extracted (is it a scanned image?).',
      data: { resumeId: null, originalFilename: req.file.originalname, parsedText: '' },
    });
  }

  const resume = await Resume.create({ originalFilename: req.file.originalname, text: resumeText });

  res.status(200).json({
    success: true,
    message: 'Resume uploaded, parsed and saved.',
    data: {
      resumeId: String(resume._id),
      originalFilename: resume.originalFilename,
      parsedText: resumeText,
    },
  });
};

module.exports = {
  uploadAndParseResume,
};
