import CredentialsPackage from '@alicloud/credentials'
import OSS from 'ali-oss'

// @alicloud/credentials is CommonJS; native Node ESM exposes its default export here.
const Credential = CredentialsPackage.default

export function createOssSigner(config) {
  const credential = new Credential({
    type: 'ecs_ram_role',
    roleName: config.ossRamRoleName,
    disableIMDSv1: true,
  })

  return async function signPutUrl({ objectPath, contentType }) {
    const temporary = await credential.getCredential()
    const client = new OSS({
      accessKeyId: temporary.accessKeyId,
      accessKeySecret: temporary.accessKeySecret,
      stsToken: temporary.securityToken,
      bucket: config.ossBucket,
      region: config.ossRegion,
      secure: true,
      authorizationV4: true,
    })

    return client.signatureUrlV4(
      'PUT',
      config.uploadUrlTtlSeconds,
      { headers: { 'content-type': contentType } },
      objectPath,
    )
  }
}
