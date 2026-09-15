import { Module } from '@nestjs/common'
import { JwtEncrypter } from './jwt.encrypter'
import { Encrypter } from '@/domain/accounts/applications/cryptography/encrypter'
import { HashCompare } from '@/domain/accounts/applications/cryptography/hash-compare'
import { HashGenerator } from '@/domain/accounts/applications/cryptography/hash-generator'
import { BcryptHasher } from './bcrypt-hashser'

@Module({
  providers: [
    { provide: Encrypter, useClass: JwtEncrypter },
    { provide: HashCompare, useClass: BcryptHasher },
    { provide: HashGenerator, useClass: BcryptHasher },
  ],
  exports: [Encrypter, HashCompare, HashGenerator],
})
export class CryptographyModule {}
