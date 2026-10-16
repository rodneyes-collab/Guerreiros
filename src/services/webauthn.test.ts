import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  getRegistrationOptions,
  getAuthenticationOptions,
  verifyRegistration,
  verifyAuthentication
} from './webauthn';

describe('WebAuthn Service', () => {
  describe('getRegistrationOptions', () => {
    test('should generate correct registration options', async () => {
      const opts = await getRegistrationOptions('user-123', 'John Doe', 'localhost');

      assert.strictEqual(opts.rp.name, 'Guerreiros Vôlei de Elite');
      assert.strictEqual(opts.rp.id, 'localhost');
      assert.strictEqual(opts.user.name, 'John Doe');
      assert.strictEqual(opts.user.displayName, 'John Doe');
      assert.strictEqual(opts.attestation, 'none');

      // Authenticator selection options
      assert.strictEqual(opts.authenticatorSelection?.authenticatorAttachment, 'platform');
      assert.strictEqual(opts.authenticatorSelection?.userVerification, 'required');
      assert.strictEqual(opts.authenticatorSelection?.residentKey, 'required');

      // Check algorithms
      assert.ok(opts.pubKeyCredParams.some(param => param.alg === -7));
      assert.ok(opts.pubKeyCredParams.some(param => param.alg === -257));
    });
  });

  describe('getAuthenticationOptions', () => {
    test('should generate correct authentication options', async () => {
      const opts = await getAuthenticationOptions('localhost');

      assert.strictEqual(opts.rpId, 'localhost');
      assert.strictEqual(opts.userVerification, 'required');
      assert.ok(typeof opts.challenge === 'string' && opts.challenge.length > 0);
    });
  });

  describe('verifyRegistration', () => {
    test('should throw error when verifying invalid registration response', async () => {
      await assert.rejects(
        async () => {
          await verifyRegistration({} as any, 'expected-challenge', 'http://localhost', 'localhost');
        },
        (err: Error) => {
          return err.message.includes('credential') || err.message.includes('response');
        }
      );
    });
  });

  describe('verifyAuthentication', () => {
    test('should throw error when verifying invalid authentication response', async () => {
      const mockAuthenticator = {
        credentialID: new Uint8Array([1, 2, 3]),
        credentialPublicKey: new Uint8Array([4, 5, 6]),
        counter: 0,
        transports: ['internal']
      };

      await assert.rejects(
        async () => {
          await verifyAuthentication({} as any, 'expected-challenge', 'http://localhost', 'localhost', mockAuthenticator);
        },
        (err: Error) => {
          return err.message.includes('credential') || err.message.includes('response');
        }
      );
    });
  });
});
