import fs from 'fs';

/**
 * Checks if a file has a UTF-8 BOM (0xEF, 0xBB, 0xBF).
 * @param filePath Absolute path to the file.
 * @returns true if the file has a UTF-8 BOM.
 */
export function hasUtf8Bom(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(3);
    const bytesRead = fs.readSync(fd, buffer, 0, 3, 0);
    fs.closeSync(fd);
    
    if (bytesRead < 3) return false;
    
    return buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF;
  } catch (err) {
    console.error(`Error checking BOM for ${filePath}:`, err);
    return false;
  }
}

/**
 * Ensures a file has or doesn't have a UTF-8 BOM.
 * @param filePath Absolute path to the file.
 * @param shouldHaveBom true if the file should have a UTF-8 BOM.
 * @returns true if the file was modified.
 */
export function ensureEncoding(filePath: string, shouldHaveBom: boolean): boolean {
  const currentHasBom = hasUtf8Bom(filePath);
  
  if (currentHasBom === shouldHaveBom) {
    return false;
  }

  try {
    const content = fs.readFileSync(filePath);
    let newContent: Buffer;

    if (shouldHaveBom) {
      // Add BOM
      const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
      newContent = Buffer.concat([bom, content]);
    } else {
      // Remove BOM (we know it has it because of the check above)
      newContent = content.subarray(3);
    }

    fs.writeFileSync(filePath, newContent);
    return true;
  } catch (err) {
    console.error(`Error fixing encoding for ${filePath}:`, err);
    return false;
  }
}
