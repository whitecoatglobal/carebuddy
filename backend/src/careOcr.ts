import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CarePage } from "care-buddy-shared";
const run = promisify(execFile);
export class CareError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
let active = false;
const command = (file: string, args: string[]) =>
  run(file, args, {
    timeout: 20_000,
    maxBuffer: 200_000,
    env: { ...process.env, OMP_THREAD_LIMIT: "1" },
  });
function jpegDimensions(data: Buffer): [number, number] | null {
  let offset = 2;
  while (offset + 4 <= data.length) {
    if (data[offset] !== 0xff) return null;
    const marker = data[offset + 1];
    if (marker === 0xda || marker === 0xd9) return null;
    const length = data.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > data.length) return null;
    if (
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf,
      ].includes(marker)
    ) {
      if (length < 7) return null;
      return [data.readUInt16BE(offset + 7), data.readUInt16BE(offset + 5)];
    }
    offset += 2 + length;
  }
  return null;
}
/** Files live in a private temporary directory, never in public static storage. */
export async function extractCareFile(
  data: Buffer,
  mimeType: string,
): Promise<CarePage[]> {
  if (!data.length || data.length > 6 * 1024 * 1024)
    throw new CareError(413, "Choose a file smaller than 6 MB.");
  const pdf =
    mimeType === "application/pdf" &&
    data.subarray(0, 5).toString() === "%PDF-";
  const png =
    mimeType === "image/png" &&
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg =
    mimeType === "image/jpeg" &&
    data[0] === 255 &&
    data[1] === 216 &&
    data[2] === 255;
  if (!pdf && !png && !jpeg)
    throw new CareError(400, "Choose a valid PNG, JPEG or PDF file.");
  if (jpeg) {
    const size = jpegDimensions(data);
    if (
      !size ||
      !size[0] ||
      !size[1] ||
      size[0] > 10000 ||
      size[1] > 10000 ||
      size[0] * size[1] > 24000000
    )
      throw new CareError(
        400,
        "Invalid JPEG or image dimensions exceed 24 megapixels.",
      );
  }
  if (active)
    throw new CareError(
      429,
      "Another document is being read. Please try again shortly.",
    );
  active = true;
  let dir = "";
  try {
    dir = await mkdtemp(path.join(tmpdir(), "carebuddy-"));
    const file = path.join(
      dir,
      pdf ? "source.pdf" : png ? "source.png" : "source.jpg",
    );
    await writeFile(file, data, { mode: 0o600 });
    let pages: CarePage[] = [];
    if (pdf) {
      const info = await command("pdfinfo", [file]);
      const count = Number(info.stdout.match(/^Pages:\s+(\d+)/m)?.[1]);
      if (!count || count > 5)
        throw new CareError(400, "Use a PDF with no more than 5 pages.");
      await command("pdftotext", ["-layout", file, path.join(dir, "text.txt")]);
      const textPages = (
        await readFile(path.join(dir, "text.txt"), "utf8")
      ).split("\f");
      for (let i = 0; i < count; i++) {
        let text = textPages[i]?.trim() ?? "";
        if (text.length < 20) {
          await command("pdftoppm", [
            "-f",
            String(i + 1),
            "-l",
            String(i + 1),
            "-scale-to",
            "1800",
            "-png",
            "-singlefile",
            file,
            path.join(dir, "page"),
          ]);
          text = (
            await command("tesseract", [
              path.join(dir, "page.png"),
              "stdout",
              "--psm",
              "3",
            ])
          ).stdout.trim();
        }
        pages.push({ page: i + 1, text });
      }
    } else {
      if (png && data.length < 24)
        throw new CareError(400, "Invalid PNG file.");
      if (
        png &&
        (data.readUInt32BE(16) > 10000 ||
          data.readUInt32BE(20) > 10000 ||
          data.readUInt32BE(16) * data.readUInt32BE(20) > 24000000)
      )
        throw new CareError(
          400,
          "Image dimensions are too large. Resize to under 24 megapixels.",
        );
      pages = [
        {
          page: 1,
          text: (
            await command("tesseract", [file, "stdout", "--psm", "3"])
          ).stdout.trim(),
        },
      ];
    }
    if (pages.reduce((n, p) => n + p.text.length, 0) > 24000)
      throw new CareError(400, "Document is too long. Use a shorter extract.");
    if (!pages.some((p) => p.text.length >= 10))
      throw new CareError(
        422,
        "No readable text found. Try a clearer photo or paste the text.",
      );
    return pages;
  } catch (e) {
    if (e instanceof CareError) throw e;
    throw new CareError(
      503,
      "Document reading is unavailable or the file could not be read. Try pasting its text.",
    );
  } finally {
    active = false;
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}
