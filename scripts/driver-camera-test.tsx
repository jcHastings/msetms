import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { DriverUpload } from "../components/driver-upload";
import { ReimbursementForm } from "../components/reimbursement-form";
import { DriverFuelPanel } from "../components/driver-fuel-panel";
import {
  CAMERA_ACCEPT,
  CAMERA_CAPTURE,
  EMPTY_CAMERA_MESSAGE,
  EMPTY_FILE_MESSAGE,
  EMPTY_GALLERY_MESSAGE,
  GALLERY_ACCEPT,
  fileWithDriverMime,
  handlePhotoInputChange,
  mimeForDriverPhoto,
  shouldSignalEmptyPick,
} from "../lib/driver-photo-pick";
import { grayscaleAndCrop, prepareDriverPhoto } from "../lib/prepare-driver-photo";

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function attr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`));
  return match ? match[1] : null;
}

function hasAttr(tag: string, name: string): boolean {
  return new RegExp(`(?:^|\\s)${name}(?:=|\\s|/|>|$)`).test(tag);
}

function inputTags(html: string): string[] {
  return html.match(/<input\b[^>]*>/g) ?? [];
}

function assertPhotoEntry(html: string, entry: string) {
  assert.match(html, new RegExp(`data-driver-photo-entry="${entry}"`), entry);
  const inputs = inputTags(html);
  const camera = inputs.find((tag) => tag.includes('data-photo-role="camera"'));
  const gallery = inputs.find((tag) => tag.includes('data-photo-role="gallery"'));
  assert.ok(camera, `${entry} camera input`);
  assert.ok(gallery, `${entry} gallery input`);
  assert.equal(attr(camera, "type"), "file", `${entry} camera type`);
  assert.equal(attr(gallery, "type"), "file", `${entry} gallery type`);
  assert.equal(attr(camera, "accept"), CAMERA_ACCEPT, `${entry} camera accept`);
  assert.equal(attr(camera, "capture"), CAMERA_CAPTURE, `${entry} camera capture`);
  assert.notEqual(attr(camera, "capture"), "user");
  assert.equal(attr(gallery, "accept"), GALLERY_ACCEPT, `${entry} gallery accept`);
  assert.equal(hasAttr(gallery, "capture"), false, `${entry} gallery must not set capture`);
  assert.equal(hasAttr(camera, "multiple"), false, `${entry} camera multiple`);
  assert.equal(hasAttr(gallery, "multiple"), false, `${entry} gallery multiple`);
  for (const tag of [camera, gallery]) {
    const className = attr(tag, "class") ?? "";
    assert.match(className, /\bdriver-photo-input\b/);
    assert.doesNotMatch(className, /\bsr-only\b|\bhidden\b/);
    assert.doesNotMatch(tag, /display:\s*none/);
    const id = attr(tag, "id");
    assert.ok(id, `${entry} input id`);
    assert.match(html, new RegExp(`<label[^>]*\\bfor="${id}"`), `${entry} label for ${id}`);
  }
  assert.equal(camera.includes("driver-photo-input-hold"), false);
  const labels = html.match(/<label\b[\s\S]*?<\/label>/g) ?? [];
  const photoLabels = labels.filter((label) => label.includes("driver-photo-trigger"));
  assert.ok(photoLabels.length >= 2, `${entry} photo labels`);
  for (const label of photoLabels) {
    assert.doesNotMatch(label, /<input\b/, `${entry} label must not wrap the file input`);
  }
  return { cameraId: attr(camera, "id") ?? "", galleryId: attr(gallery, "id") ?? "" };
}

function render(node: React.ReactNode): string {
  const router = {
    back() {},
    forward() {},
    refresh() {},
    push() {},
    replace() {},
    prefetch() {},
    bfcacheId: "test",
  };
  return renderToStaticMarkup(<AppRouterContext.Provider value={router}>{node}</AppRouterContext.Provider>);
}

async function main() {
  const upload = read("components/driver-upload.tsx");
  const fields = read("components/driver-photo-fields.tsx");
  const assist = read("components/driver-assist-sheet.tsx");
  const claims = read("app/claims/page.tsx");
  const actions = read("components/driver-load-actions.tsx");
  const css = read("app/globals.css");

  assert.doesNotMatch(upload, /getUserMedia/);
  assert.doesNotMatch(fields, /getUserMedia/);
  assert.doesNotMatch(upload, /capture="user"/);
  assert.match(upload, /prepareDriverPhoto/);
  assert.match(upload, /handlePhotoInputChange|DriverPhotoFields/);
  assert.match(fields, /handlePhotoInputChange/);
  assert.match(fields, /htmlFor=\{cameraId\}/);
  assert.match(fields, /htmlFor=\{galleryId\}/);
  assert.doesNotMatch(fields, /\.click\s*\(/);
  const armWatch = fields.slice(fields.indexOf("function armWatch"), fields.indexOf("function onLabelClick"));
  const armSync = armWatch.slice(0, armWatch.indexOf("const report"));
  assert.doesNotMatch(armSync, /setNotice|setChosenName|setNamedSource/);
  const labelClick = fields.slice(fields.indexOf("function onLabelClick"), fields.indexOf("function onChange"));
  assert.match(labelClick, /if \(disabled\)/);
  assert.match(labelClick, /preventDefault/);
  assert.match(labelClick, /armWatch\(source\)/);
  assert.match(actions, /lockedKind="pod"/);
  assert.doesNotMatch(assist, /type="file"|getUserMedia/);
  assert.doesNotMatch(claims, /type="file"|getUserMedia/);
  assert.equal(fs.existsSync(path.join(process.cwd(), "playwright.config.ts")), false);

  const cameraRule = css.slice(css.indexOf('input.driver-photo-input[type="file"]'));
  const cameraBody = cameraRule.slice(0, cameraRule.indexOf("}"));
  assert.doesNotMatch(cameraBody, /display\s*:\s*none/);
  assert.doesNotMatch(cameraBody, /visibility\s*:\s*hidden/);
  assert.match(cameraBody, /opacity:\s*0\.02/);
  assert.match(cameraBody, /min-height:\s*44px/);
  assert.doesNotMatch(cameraBody, /pointer-events\s*:\s*none/);
  assert.doesNotMatch(cameraBody, /appearance\s*:\s*none/);
  const triggerRule = css.slice(css.indexOf(".driver-photo-trigger {"), css.indexOf(".driver-photo-trigger-primary"));
  assert.doesNotMatch(triggerRule, /transform\s*:/);
  assert.match(triggerRule, /touch-action:\s*manipulation/);
  const spanRule = css.slice(css.indexOf(".driver-photo-trigger > span"));
  const spanBody = spanRule.slice(0, spanRule.indexOf("}"));
  assert.match(spanBody, /pointer-events:\s*none/);
  assert.equal(CAMERA_ACCEPT, "image/*");
  assert.match(GALLERY_ACCEPT, /image\/heic/);
  assert.match(GALLERY_ACCEPT, /image\/heif/);
  assert.doesNotMatch(CAMERA_ACCEPT, /heic|heif|pdf/);
  const filesSource = read("lib/files.ts");
  assert.match(filesSource, /if \(ext === "\.heif"\) return "image\/heif"/);
  assert.match(css, /\.driver-photo-trigger-primary[\s\S]*min-height:\s*5rem/);
  assert.match(css, /\.driver-photo-trigger-secondary[\s\S]*min-height:\s*3\.5rem/);

  const sameFile = {
    value: "C:\\fakepath\\bol.jpg",
    files: { length: 1, 0: { size: 1200, name: "bol.jpg" } },
  };
  const picked = handlePhotoInputChange(sameFile, "camera");
  assert.equal(sameFile.value, "");
  assert.equal(picked.file?.name, "bol.jpg");
  assert.equal(picked.message, null);
  const again = {
    value: "C:\\fakepath\\bol.jpg",
    files: { length: 1, 0: { size: 1200, name: "bol.jpg" } },
  };
  const repicked = handlePhotoInputChange(again, "camera");
  assert.equal(again.value, "");
  assert.equal(repicked.file?.name, "bol.jpg");

  const emptyFile = { value: "x", files: { length: 1, 0: { size: 0, name: "empty.jpg" } } };
  const emptyPick = handlePhotoInputChange(emptyFile, "gallery");
  assert.equal(emptyFile.value, "");
  assert.equal(emptyPick.file, null);
  assert.equal(emptyPick.message, EMPTY_FILE_MESSAGE);

  const cancelled = { value: "x", files: { length: 0 } as { length: number; 0?: { size: number; name: string } } };
  const cancelPick = handlePhotoInputChange(cancelled, "camera");
  assert.equal(cancelled.value, "");
  assert.equal(cancelPick.message, EMPTY_CAMERA_MESSAGE);
  const galleryCancel = handlePhotoInputChange(
    { value: "y", files: null },
    "gallery",
  );
  assert.equal(galleryCancel.message, EMPTY_GALLERY_MESSAGE);

  assert.equal(shouldSignalEmptyPick({ left: false, picked: false }), false);
  assert.equal(shouldSignalEmptyPick({ left: true, picked: true }), false);
  assert.equal(shouldSignalEmptyPick({ left: true, picked: false }), true);

  assert.equal(mimeForDriverPhoto({ name: "IMG.HEIC", type: "" }), "image/heic");
  assert.equal(mimeForDriverPhoto({ name: "scan.heif", type: "application/octet-stream" }), "image/heif");
  assert.equal(mimeForDriverPhoto({ name: "a.bin", type: "image/heic-sequence" }), "image/heic");
  assert.equal(mimeForDriverPhoto({ name: "a.bin", type: "image/heif" }), "image/heif");
  assert.equal(mimeForDriverPhoto({ name: "bol.jpg", type: "image/jpeg" }), "image/jpeg");
  const heicFile = new File([Uint8Array.from([1, 2, 3])], "IMG_1.HEIC", { type: "" });
  const typedHeic = fileWithDriverMime(heicFile);
  assert.equal(typedHeic.type, "image/heic");
  assert.equal(typedHeic.name, "IMG_1.HEIC");
  const heifFile = new File([Uint8Array.from([1])], "scan.heif", { type: "application/octet-stream" });
  assert.equal(fileWithDriverMime(heifFile).type, "image/heif");
  const jpegFile = new File([Uint8Array.from([1])], "bol.jpg", { type: "image/jpeg" });
  assert.equal(fileWithDriverMime(jpegFile), jpegFile);

  const undecoded = await prepareDriverPhoto(new Blob([Uint8Array.from([1, 2, 3])], { type: "image/heic" }));
  assert.equal(undecoded.kind, "original");
  const previousDocument = globalThis.document;
  const previousBitmap = globalThis.createImageBitmap;
  Object.defineProperty(globalThis, "document", {
    value: {
      createElement() {
        throw new Error("HEIC decode");
      },
    },
    configurable: true,
  });
  globalThis.createImageBitmap = async () => {
    throw new Error("HEIC decode");
  };
  const thrown = await prepareDriverPhoto(new Blob([Uint8Array.from([1])], { type: "image/heic" }));
  assert.equal(thrown.kind, "original");
  if (previousDocument === undefined) Reflect.deleteProperty(globalThis, "document");
  else Object.defineProperty(globalThis, "document", { value: previousDocument, configurable: true });
  if (previousBitmap === undefined) Reflect.deleteProperty(globalThis, "createImageBitmap");
  else globalThis.createImageBitmap = previousBitmap;

  const width = 50;
  const height = 50;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 250;
    rgba[i + 1] = 250;
    rgba[i + 2] = 250;
    rgba[i + 3] = 255;
  }
  for (let y = 10; y < 40; y += 1) {
    for (let x = 10; x < 40; x += 1) {
      const i = (y * width + x) * 4;
      rgba[i] = 12;
      rgba[i + 1] = 40;
      rgba[i + 2] = 80;
    }
  }
  const cropped = await grayscaleAndCrop(rgba, width, height);
  assert.ok(cropped.width < width && cropped.width > 20);
  assert.ok(cropped.height < height && cropped.height > 20);
  assert.equal(cropped.rgba[0], cropped.rgba[1]);
  assert.equal(cropped.rgba[1], cropped.rgba[2]);

  const loadHtml = render(<DriverUpload loadId={7} loadNumber="MSE-1042" />);
  const podHtml = render(
    <DriverUpload loadId={7} loadNumber="MSE-1042" lockedKind="pod" title="POD photo" />,
  );
  const bothHtml = render(
    <>
      <DriverUpload loadId={7} loadNumber="MSE-1042" />
      <DriverUpload loadId={7} loadNumber="MSE-1042" lockedKind="pod" title="POD photo" />
    </>,
  );
  const reimburseHtml = render(<ReimbursementForm loads={[{ id: 7, label: "MSE-1042 · Dallas → Tulsa" }]} />);
  const fuelHtml = render(<DriverFuelPanel transactions={[]} pending={[]} />);

  assertPhotoEntry(loadHtml, "load-document");
  assert.match(loadHtml, /Take photo/);
  assert.match(loadHtml, /Choose from photos/);
  assert.match(loadHtml, /Document type/);
  assert.match(loadHtml, /data-driver-upload/);
  assert.doesNotMatch(loadHtml, /getUserMedia|capture="user"/);

  assertPhotoEntry(podHtml, "pod-delivery");
  assert.match(podHtml, /Take POD photo/);
  assert.match(podHtml, /Choose from photos/);
  assert.doesNotMatch(podHtml, /Document type/);

  assertPhotoEntry(reimburseHtml, "reimbursement");
  assert.match(reimburseHtml, /name="receipt"/);
  assert.match(reimburseHtml, /Receipt photo/);

  assertPhotoEntry(fuelHtml, "fuel-receipt");
  assert.match(fuelHtml, /name="file"/);
  assert.match(fuelHtml, /Take a photo now/);

  const bothCameras = inputTags(bothHtml).filter((tag) => tag.includes('data-photo-role="camera"'));
  assert.equal(bothCameras.length, 2);
  const bothIds = bothCameras.map((tag) => attr(tag, "id"));
  assert.notEqual(bothIds[0], bothIds[1]);
  for (const id of bothIds) {
    assert.match(bothHtml, new RegExp(`<label[^>]*\\bfor="${id}"`));
  }

  console.log("driver camera tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
