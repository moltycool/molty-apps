import crypto from "node:crypto";

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;

export const hashPassword = async (password: string): Promise<string> => {
  const salt = crypto.randomBytes(SALT_LENGTH).toString("hex");
  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      KEY_LENGTH,
      {
        N: SCRYPT_COST,
        r: SCRYPT_BLOCK_SIZE,
        p: SCRYPT_PARALLELIZATION
      },
      (err, key) => {
        if (err) {
          reject(err);
        } else {
          resolve(key as Buffer);
        }
      }
    );
  });

  return `scrypt$${salt}$${derived.toString("hex")}`;
};

export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) {
    return false;
  }

  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      KEY_LENGTH,
      {
        N: SCRYPT_COST,
        r: SCRYPT_BLOCK_SIZE,
        p: SCRYPT_PARALLELIZATION
      },
      (err, key) => {
        if (err) {
          reject(err);
        } else {
          resolve(key as Buffer);
        }
      }
    );
  });

  const storedBuffer = Buffer.from(hash, "hex");
  if (storedBuffer.length !== derived.length) {
    return false;
  }

  return crypto.timingSafeEqual(storedBuffer, derived);
};
