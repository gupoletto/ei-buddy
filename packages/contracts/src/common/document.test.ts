import { describe, expect, it } from 'vitest'
import { dddDe, tipoDePessoa } from './document.js'
import { cnpjSchema, cpfSchema, documentSchema, isValidCnpj, isValidCpf } from './document.js'

describe('CPF', () => {
  it.each(['52998224725', '111.444.777-35', '529.982.247-25'])('aceita %s', (valor) => {
    expect(isValidCpf(valor)).toBe(true)
  })

  it.each([
    ['52998224724', 'digito verificador errado'],
    ['11111111111', 'todos os digitos iguais'],
    ['00000000000', 'so zeros'],
    ['5299822472', 'digitos de menos'],
    ['529982247255', 'digitos de mais'],
    ['', 'vazio'],
    ['abcdefghijk', 'sem digito nenhum'],
  ])('recusa %s (%s)', (valor, _motivo) => {
    expect(isValidCpf(valor)).toBe(false)
  })

  it('guarda so os digitos, sem a mascara', () => {
    expect(cpfSchema.parse('529.982.247-25')).toBe('52998224725')
  })

  it('devolve mensagem em pt-br quando recusa', () => {
    const r = cpfSchema.safeParse('11111111111')
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0]?.message).toBe('CPF invalido. Confira os numeros.')
  })
})

describe('CNPJ', () => {
  it.each(['11222333000181', '11.222.333/0001-81', '04544887000130'])('aceita %s', (valor) => {
    expect(isValidCnpj(valor)).toBe(true)
  })

  it.each([
    ['11222333000182', 'digito verificador errado'],
    ['11111111111111', 'todos iguais'],
    ['1122233300018', 'digitos de menos'],
    ['52998224725', 'e um CPF, nao um CNPJ'],
  ])('recusa %s (%s)', (valor, _motivo) => {
    expect(isValidCnpj(valor)).toBe(false)
  })

  it('guarda so os digitos', () => {
    expect(cnpjSchema.parse('11.222.333/0001-81')).toBe('11222333000181')
  })
})

describe('documento do cliente decide pelo tamanho', () => {
  it('aceita CPF e CNPJ validos', () => {
    expect(documentSchema.parse('529.982.247-25')).toBe('52998224725')
    expect(documentSchema.parse('11.222.333/0001-81')).toBe('11222333000181')
  })

  it.each([
    ['1234567890', '10 digitos nao e nem um nem outro'],
    ['123456789012', '12 digitos tambem nao'],
    ['52998224724', 'CPF com digito errado'],
    ['11222333000182', 'CNPJ com digito errado'],
  ])('recusa %s (%s)', (valor, _motivo) => {
    expect(documentSchema.safeParse(valor).success).toBe(false)
  })
})

describe('tipo de pessoa, deduzido do documento — NR-072', () => {
  it('onze digitos e pessoa fisica', () => {
    expect(tipoDePessoa('529.982.247-25')).toBe('fisica')
    expect(tipoDePessoa('52998224725')).toBe('fisica')
  })

  it('catorze digitos e pessoa juridica', () => {
    expect(tipoDePessoa('11.222.333/0001-81')).toBe('juridica')
    expect(tipoDePessoa('11222333000181')).toBe('juridica')
  })

  it('sem documento nao chuta', () => {
    /* O cliente de balcao (RF-009) nao tem documento, e assumir "fisica" seria
       inventar — um cadastro com tipo errado emite nota errada. */
    expect(tipoDePessoa(null)).toBeNull()
  })

  it('documento com tamanho estranho tambem nao chuta', () => {
    expect(tipoDePessoa('123')).toBeNull()
    expect(tipoDePessoa('')).toBeNull()
  })
})

describe('DDD, dos dois primeiros digitos — NR-072', () => {
  it('tira o DDD do celular com pontuacao', () => {
    expect(dddDe('(41) 99999-0000')).toBe('41')
  })

  it('tira o DDD do fixo', () => {
    expect(dddDe('1133334444')).toBe('11')
  })

  it('numero incompleto nao vira DDD', () => {
    /* Devolver os dois primeiros de um numero pela metade daria um DDD
       inventado — e o lojista ligaria para a cidade errada. */
    expect(dddDe('99999')).toBeNull()
  })

  it('sem telefone devolve nulo', () => {
    expect(dddDe(null)).toBeNull()
  })
})
