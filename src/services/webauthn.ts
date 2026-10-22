
import { 
  generateRegistrationOptions, 
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse 
} from '@simplewebauthn/server';

// NOTE: In a production app, persist these properly in Firestore
// This is a minimal helper to handle the WebAuthn flow logic

export const getRegistrationOptions = async (userId: string, userName: string, rpID: string) => {
  const safeUserId = userId && userId.trim() ? userId.trim() : (userName ? `user_${userName.trim().toLowerCase()}` : `user_${Date.now()}`);
  return generateRegistrationOptions({
    rpName: 'Guerreiros Vôlei de Elite',
    rpID,
    userID: Buffer.from(safeUserId),
    userName: userName || 'Sócio Guerreiros',
    userDisplayName: userName || 'Sócio Guerreiros',
    attestationType: 'none',
    supportedAlgorithmIDs: [-7, -257],
    authenticatorSelection: {
      userVerification: 'preferred',
      residentKey: 'preferred',
    },
  });
};

export const verifyRegistration = async (body: any, expectedChallenge: string, expectedOrigin: string | string[], expectedRPID: string | string[]) => {
  return verifyRegistrationResponse({
    response: body,
    expectedChallenge,
    expectedOrigin,
    expectedRPID,
    requireUserVerification: false,
  });
};

export const getAuthenticationOptions = async (rpID: string, allowCredentials?: any[]) => {
  return generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
    allowCredentials: allowCredentials && allowCredentials.length > 0 ? allowCredentials : undefined,
  });
};

export const verifyAuthentication = async (
  body: any, 
  expectedChallenge: string, 
  expectedOrigin: string | string[], 
  expectedRPID: string | string[], 
  authenticator: any
) => {
  return verifyAuthenticationResponse({
    response: body,
    expectedChallenge,
    expectedOrigin,
    expectedRPID,
    requireUserVerification: false,
    credential: {
      id: authenticator.credentialID,
      publicKey: authenticator.credentialPublicKey,
      counter: authenticator.counter || 0,
      transports: authenticator.transports,
    },
  });
};
