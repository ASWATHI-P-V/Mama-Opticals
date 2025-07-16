const path = require("path");
const os = require("os");
const sharp = require("sharp");
const { v4: uuidv4 } = require("uuid");

exports.changeFileMimeType = (file) => {
  const format = path.extname(file.name).replace(".", "");
  if (format) {
    return `image/${format}`;
  }
  strapi.log.warn("Invalid file extension:", file.name);
  return "image/jpeg";
};

exports.processImageFile = async (file, maxWidth, maxHeight, quality = 80) => {
  const originalImage = sharp(file.path);
  const { width, height } = await originalImage.metadata();

  const widthScale = maxWidth / width;
  const heightScale = maxHeight / height;
  const scaleFactor = Math.min(widthScale, heightScale, 1);

  const newWidth = Math.floor(width * scaleFactor);
  const newHeight = Math.floor(height * scaleFactor);

  const resizedImage = originalImage.resize(newWidth, newHeight, {
    fit: sharp.fit.inside,
    withoutEnlargement: true,
  });

  const processedImagePath = path.join(
    os.tmpdir(),
    `processed-${uuidv4()}.webp`
  );

  await resizedImage.webp({ quality: quality }).toFile(processedImagePath);

  return {
    name: file.name,
    path: processedImagePath,
    size: file.size,
    ext: ".webp",
    type: "image/webp",
  };
};
