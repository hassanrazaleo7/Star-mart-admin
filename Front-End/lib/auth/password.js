import { randomBytes, scrypt as callbackScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { hash, verify } from "@node-rs/argon2";

const scrypt = promisify(callbackScrypt);
const argon2Options = {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
    outputLen: 32,
};
const legacyScryptPattern = /^scrypt\$(17)\$([0-9a-f]{128})$/u;
const legacyScryptN = 2 ** 17;
const legacyScryptOptions = {
    N: legacyScryptN,
    r: 8,
    p: 1,
    maxmem: 256 * 1024 * 1024,
};

async function deriveLegacyScrypt(password, salt) {
    return scrypt(password, salt, 64, legacyScryptOptions);
}

export function isLegacyScryptHash(passwordHash) {
    return typeof passwordHash === "string" && legacyScryptPattern.test(passwordHash);
}

export async function hashPassword(password) {
    const salt = randomBytes(16).toString("hex");
    const passwordHash = await hash(password, argon2Options);

    if (!passwordHash.startsWith("$argon2id$")) {
        throw new Error("Password hashing produced an unexpected algorithm");
    }

    return { passwordHash, salt };
}

export async function verifyPassword(password, salt, passwordHash) {
    if (typeof passwordHash !== "string") {
        return false;
    }

    if (isLegacyScryptHash(passwordHash)) {
        if (typeof salt !== "string" || !/^[0-9a-f]{32}$/iu.test(salt)) {
            return false;
        }

        const [, , expectedHex] = passwordHash.match(legacyScryptPattern);
        const expected = Buffer.from(expectedHex, "hex");
        const actual = await deriveLegacyScrypt(password, salt);
        return timingSafeEqual(actual, expected);
    }

    if (passwordHash.startsWith("$argon2id$")) {
        try {
            return await verify(passwordHash, password);
        } catch (error) {
            console.error("Argon2id password verification failed", error);
            return false;
        }
    }

    return false;
}

let dummyArgon2Hash;

async function burnArgon2Verification(password) {
    dummyArgon2Hash ??= hashPassword(randomBytes(32).toString("hex")).then(({ passwordHash }) => passwordHash);
    await verify(await dummyArgon2Hash, password);
}

async function burnScryptVerification(password) {
    await deriveLegacyScrypt(password, randomBytes(16).toString("hex"));
}

export async function performDummyPasswordCheck(password) {
    await Promise.all([
        burnArgon2Verification(password),
        burnScryptVerification(password),
    ]);
}

export async function burnPasswordVerification(password, passwordHash) {
    if (isLegacyScryptHash(passwordHash)) {
        await burnArgon2Verification(password);
        return;
    }

    await burnScryptVerification(password);
}
