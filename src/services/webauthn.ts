
import { 
  generateRegistrationOptions, 
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse 
} from '@simplewebauthn/server';

// NOTE: In a production app, persist these properly in Firestore
// This is a minimal helper to handle the WebAuthn flow logic

export const getRegistrationOptions = async (userId: string, userName: string, rpID: string) => {
  return generateRegistrationOptions({
    rpName: 'Guerreiros Vôlei de Elite',
    rpID,
    userID: Buffer.from(userId),
    userName: userName,
    userDisplayName: userName,
    attestationType: 'none',
    supportedAlgorithmIDs: [-7, -257],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
      residentKey: 'required',
    },
  });
};

export const verifyRegistration = async (body: any, expectedChallenge: string, expectedOrigin: string, expectedRPID: string) => {
  return verifyRegistrationResponse({
    response: body,
    expectedChallenge,
    expectedOrigin,
    expectedRPID,
  });
};

export const getAuthenticationOptions = async (rpID: string) => {
    return generateAuthenticationOptions({
      rpID,
      userVerification: 'required',
    });
};

export const verifyAuthentication = async (body: any, expectedChallenge: string, expectedOrigin: string, expectedRPID: string, authenticator: any) => {
  return verifyAuthenticationResponse({
    response: body,
    expectedChallenge,
    expectedOrigin,
    expectedRPID,
    credential: {
      id: authenticator.credentialID,
      publicKey: authenticator.credentialPublicKey,
      counter: authenticator.counter,
      transports: authenticator.transports,
    },
  });
};
