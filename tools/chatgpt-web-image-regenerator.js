"use strict";

var fs = require("fs");
var path = require("path");

var CHATGPT_URL = "https://chatgpt.com/";
var COMPOSER_SELECTOR = '[contenteditable="true"]';
var FILE_INPUT_SELECTOR = 'input[type="file"]';
var SEND_BUTTON_SELECTOR = '[data-testid="send-button"]';
var COMPOSER_TIMEOUT_MS = 300000;
var UPLOAD_SETTLE_MS = 3000;
var SEND_READY_TIMEOUT_MS = 300000;
var SEND_READY_POLL_INTERVAL_MS = 1000;
var GENERATION_TIMEOUT_MS = 600000;
var DOWNLOAD_TIMEOUT_MS = 120000;
var IMAGE_POLL_INTERVAL_MS = 2000;
var MIN_GENERATED_IMAGE_SIDE = 128;
var IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];
var GENERATED_IMAGE_EXTENSIONS = [".png", ".jpg", ".webp"];

function parseArgs(argv) {
  var args = {};

  for (var index = 0; index < argv.length; index += 1) {
    var key = argv[index];
    if (key === "--overwrite") {
      args.overwrite = true;
    } else {
      if (key.slice(0, 2) !== "--") {
        throw new Error("Invalid argument: " + key);
      }
      if (index + 1 >= argv.length) {
        throw new Error("Missing value for argument: " + key);
      }
      args[key.slice(2)] = argv[index + 1];
      index += 1;
    }
  }

  return args;
}

function requireArg(args, key) {
  if (!Object.prototype.hasOwnProperty.call(args, key)) {
    throw new Error("Missing required argument: --" + key);
  }
  if (typeof args[key] !== "string") {
    throw new Error("Argument --" + key + " must be a string");
  }
  if (!args[key].trim()) {
    throw new Error("Argument --" + key + " must not be empty");
  }
  return args[key];
}

function assertDirectory(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(label + " does not exist: " + filePath);
  }
  if (!fs.statSync(filePath).isDirectory()) {
    throw new Error(label + " must be a directory: " + filePath);
  }
}

function assertFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(label + " does not exist: " + filePath);
  }
  if (!fs.statSync(filePath).isFile()) {
    throw new Error(label + " must be a file: " + filePath);
  }
}

function ensureOutputDirectory(directoryPath) {
  if (fs.existsSync(directoryPath)) {
    if (!fs.statSync(directoryPath).isDirectory()) {
      throw new Error("Output path exists but is not a directory: " + directoryPath);
    }
  } else {
    fs.mkdirSync(directoryPath, { recursive: true });
  }
}

function ensureProfileDirectory(directoryPath) {
  if (fs.existsSync(directoryPath)) {
    if (!fs.statSync(directoryPath).isDirectory()) {
      throw new Error("Profile path exists but is not a directory: " + directoryPath);
    }
  } else {
    fs.mkdirSync(directoryPath, { recursive: true });
  }
}

function isImageFile(fileName) {
  var extension = path.extname(fileName).toLowerCase();
  return IMAGE_EXTENSIONS.indexOf(extension) !== -1;
}

function listImages(inputDirectory) {
  var files = fs.readdirSync(inputDirectory)
    .filter(function (fileName) {
      return isImageFile(fileName);
    })
    .sort(function (a, b) {
      return a.localeCompare(b);
    })
    .map(function (fileName) {
      return path.join(inputDirectory, fileName);
    });

  if (!files.length) {
    throw new Error("No image files found in input directory: " + inputDirectory);
  }

  return files;
}

function buildPrompt(promptTemplate, imagePath, referenceImagePath) {
  var parsed = path.parse(imagePath);
  var prompt = promptTemplate
    .split("{filename}").join(path.basename(imagePath))
    .split("{basename}").join(parsed.name);

  if (referenceImagePath) {
    prompt = prompt
      .split("{reference_filename}").join(path.basename(referenceImagePath))
      .split("{reference_basename}").join(path.parse(referenceImagePath).name);
  }

  return prompt;
}

function assertPrompt(prompt) {
  if (typeof prompt !== "string") {
    throw new Error("Prompt must be a string");
  }
  if (!prompt.trim()) {
    throw new Error("Prompt must not be empty");
  }
}

async function getLargeImageCount(page) {
  return page.evaluate(function (minimumSide) {
    var images = Array.prototype.slice.call(document.images);
    return images.filter(function (image) {
      return image.complete &&
        image.naturalWidth >= minimumSide &&
        image.naturalHeight >= minimumSide &&
        typeof image.src === "string" &&
        image.src.length > 0;
    }).length;
  }, MIN_GENERATED_IMAGE_SIDE);
}

async function getLatestLargeImage(page) {
  return page.evaluate(function (minimumSide) {
    var images = Array.prototype.slice.call(document.images);
    var candidates = images.filter(function (image) {
      return image.complete &&
        image.naturalWidth >= minimumSide &&
        image.naturalHeight >= minimumSide &&
        typeof image.src === "string" &&
        image.src.length > 0;
    });

    if (!candidates.length) {
      throw new Error("No large image found in the ChatGPT page");
    }

    var image = candidates[candidates.length - 1];
    var source = image.currentSrc;
    if (!source) {
      source = image.src;
    }

    return {
      src: source,
      width: image.naturalWidth,
      height: image.naturalHeight
    };
  }, MIN_GENERATED_IMAGE_SIDE);
}

async function waitForNewGeneratedImage(page, previousLargeImageCount) {
  var startedAt = Date.now();
  while (Date.now() - startedAt < GENERATION_TIMEOUT_MS) {
    var currentLargeImageCount = await getLargeImageCount(page);
    if (currentLargeImageCount > previousLargeImageCount) {
      return getLatestLargeImage(page);
    }
    await page.waitForTimeout(IMAGE_POLL_INTERVAL_MS);
  }

  throw new Error("Timed out waiting for generated image");
}

async function fetchDataUrl(dataUrl) {
  var match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Unsupported data URL format");
  }

  return {
    contentType: match[1],
    buffer: Buffer.from(match[2], "base64")
  };
}

async function fetchBlobUrl(page, blobUrl) {
  var payload = await page.evaluate(async function (source) {
    var response = await fetch(source);
    if (!response.ok) {
      throw new Error("Blob fetch failed with status " + response.status);
    }

    var blob = await response.blob();
    var arrayBuffer = await blob.arrayBuffer();
    var bytes = new Uint8Array(arrayBuffer);
    var binary = "";
    var chunkSize = 8192;

    for (var index = 0; index < bytes.length; index += chunkSize) {
      var chunk = bytes.slice(index, index + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }

    return {
      contentType: blob.type,
      base64: btoa(binary)
    };
  }, blobUrl);

  if (!payload.contentType) {
    throw new Error("Generated blob image has no content type");
  }

  return {
    contentType: payload.contentType,
    buffer: Buffer.from(payload.base64, "base64")
  };
}

async function fetchNetworkImage(context, imageUrl) {
  var response = await context.request.get(imageUrl, { timeout: DOWNLOAD_TIMEOUT_MS });
  if (!response.ok()) {
    throw new Error("Image download failed with status " + response.status() + ": " + imageUrl);
  }

  var headers = response.headers();
  var contentType = headers["content-type"];
  if (!contentType) {
    throw new Error("Downloaded image response has no content-type: " + imageUrl);
  }

  return {
    contentType: contentType,
    buffer: await response.body()
  };
}

async function fetchGeneratedImage(page, context, imageUrl) {
  if (imageUrl.slice(0, 5) === "data:") {
    return fetchDataUrl(imageUrl);
  }

  if (imageUrl.slice(0, 5) === "blob:") {
    return fetchBlobUrl(page, imageUrl);
  }

  return fetchNetworkImage(context, imageUrl);
}

function extensionFromContentType(contentType) {
  var normalized = contentType.split(";")[0].trim().toLowerCase();
  if (normalized === "image/png") {
    return ".png";
  }
  if (normalized === "image/jpeg") {
    return ".jpg";
  }
  if (normalized === "image/webp") {
    return ".webp";
  }
  throw new Error("Unsupported generated image content-type: " + contentType);
}

async function waitForComposer(page) {
  await page.locator(COMPOSER_SELECTOR).last().waitFor({
    state: "visible",
    timeout: COMPOSER_TIMEOUT_MS
  });
}

function buildUploadPaths(imagePath, referenceImagePath) {
  if (referenceImagePath) {
    return [imagePath, referenceImagePath];
  }

  return imagePath;
}

async function waitForSendButtonEnabled(page, sendButton) {
  var startedAt = Date.now();
  while (Date.now() - startedAt < SEND_READY_TIMEOUT_MS) {
    if (await sendButton.isEnabled()) {
      return;
    }
    await page.waitForTimeout(SEND_READY_POLL_INTERVAL_MS);
  }

  throw new Error("Timed out waiting for ChatGPT send button to become enabled");
}

async function submitImage(page, imagePath, referenceImagePath, prompt) {
  await waitForComposer(page);

  var fileInput = page.locator(FILE_INPUT_SELECTOR).last();
  await fileInput.setInputFiles(buildUploadPaths(imagePath, referenceImagePath));
  await page.waitForTimeout(UPLOAD_SETTLE_MS);

  var previousLargeImageCount = await getLargeImageCount(page);
  var composer = page.locator(COMPOSER_SELECTOR).last();
  await composer.click();
  await page.keyboard.insertText(prompt);

  var sendButton = page.locator(SEND_BUTTON_SELECTOR).last();
  await sendButton.waitFor({
    state: "visible",
    timeout: COMPOSER_TIMEOUT_MS
  });
  await waitForSendButtonEnabled(page, sendButton);
  await sendButton.click({ timeout: SEND_READY_TIMEOUT_MS });

  return waitForNewGeneratedImage(page, previousLargeImageCount);
}

function outputPathForImage(outputDirectory, inputImagePath, contentType) {
  var parsed = path.parse(inputImagePath);
  var extension = extensionFromContentType(contentType);
  return path.join(outputDirectory, parsed.name + extension);
}

function assertNoOutputCollision(outputDirectory, inputImagePath, overwrite) {
  if (overwrite !== true) {
    var parsed = path.parse(inputImagePath);
    GENERATED_IMAGE_EXTENSIONS.forEach(function (extension) {
      var outputPath = path.join(outputDirectory, parsed.name + extension);
      if (fs.existsSync(outputPath)) {
        throw new Error("Output file already exists: " + outputPath);
      }
    });
  }
}

async function regenerateOneImage(page, context, outputDirectory, promptTemplate, imagePath, referenceImagePath, overwrite) {
  assertNoOutputCollision(outputDirectory, imagePath, overwrite);

  var prompt = buildPrompt(promptTemplate, imagePath, referenceImagePath);
  assertPrompt(prompt);

  await page.goto(CHATGPT_URL, { waitUntil: "domcontentloaded" });
  var generatedImage = await submitImage(page, imagePath, referenceImagePath, prompt);
  var downloadedImage = await fetchGeneratedImage(page, context, generatedImage.src);
  var outputPath = outputPathForImage(outputDirectory, imagePath, downloadedImage.contentType);

  if (fs.existsSync(outputPath) && overwrite !== true) {
    throw new Error("Output file already exists: " + outputPath);
  }

  fs.writeFileSync(outputPath, downloadedImage.buffer);
  console.log("[OK]", path.basename(imagePath), "=>", outputPath, generatedImage.width + "x" + generatedImage.height);
}

async function main() {
  var args = parseArgs(process.argv.slice(2));
  var inputDirectory = path.resolve(requireArg(args, "input"));
  var outputDirectory = path.resolve(requireArg(args, "output"));
  var promptFile = path.resolve(requireArg(args, "prompt-file"));
  var profileDirectory = path.resolve(requireArg(args, "profile"));
  var browserExecutable = path.resolve(requireArg(args, "browser-executable"));
  var referenceImagePath = null;

  if (Object.prototype.hasOwnProperty.call(args, "reference-image")) {
    referenceImagePath = path.resolve(requireArg(args, "reference-image"));
  }

  assertDirectory(inputDirectory, "Input directory");
  assertFile(promptFile, "Prompt file");
  assertFile(browserExecutable, "Browser executable");
  if (referenceImagePath) {
    assertFile(referenceImagePath, "Reference image");
  }
  ensureOutputDirectory(outputDirectory);
  ensureProfileDirectory(profileDirectory);

  var promptTemplate = fs.readFileSync(promptFile, "utf8");
  assertPrompt(promptTemplate);
  var imagePaths = listImages(inputDirectory);
  var playwright = require("playwright-core");

  var context = await playwright.chromium.launchPersistentContext(profileDirectory, {
    executablePath: browserExecutable,
    headless: false,
    acceptDownloads: true,
    viewport: {
      width: 1440,
      height: 1000
    }
  });

  var page = await context.newPage();

  for (var index = 0; index < imagePaths.length; index += 1) {
    await regenerateOneImage(
      page,
      context,
      outputDirectory,
      promptTemplate,
      imagePaths[index],
      referenceImagePath,
      args.overwrite
    );
  }

  await context.close();
}

main().catch(function (error) {
  console.error(error.stack);
  process.exit(1);
});
