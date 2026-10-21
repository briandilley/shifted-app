import { describe, expect, it } from 'vitest'
import { DEFAULT_DOWNLOAD_NAME, uniqueFileName } from '../../src/main/download-names'

function takenIn(names: string[]): (candidate: string) => boolean {
  const taken = new Set(names)
  return (candidate) => taken.has(candidate)
}

describe('uniqueFileName', () => {
  it('keeps a name that is not taken', () => {
    expect(uniqueFileName('report.pdf', takenIn([]))).toBe('report.pdf')
  })

  it('adds " (1)" and " (2)" before the extension', () => {
    expect(uniqueFileName('report.pdf', takenIn(['report.pdf']))).toBe('report (1).pdf')
    expect(uniqueFileName('report.pdf', takenIn(['report.pdf', 'report (1).pdf']))).toBe(
      'report (2).pdf'
    )
  })

  it('uses the last extension of a name with many dots', () => {
    expect(uniqueFileName('archive.tar.gz', takenIn(['archive.tar.gz']))).toBe('archive.tar (1).gz')
  })

  it('adds the number at the end of a name with no extension or a dot file', () => {
    expect(uniqueFileName('README', takenIn(['README']))).toBe('README (1)')
    expect(uniqueFileName('.env', takenIn(['.env']))).toBe('.env (1)')
  })

  it('keeps only the last part of a name with folders', () => {
    expect(uniqueFileName('../../evil.sh', takenIn([]))).toBe('evil.sh')
    expect(uniqueFileName('..\\..\\evil.bat', takenIn([]))).toBe('evil.bat')
  })

  it('uses a default name for an empty name', () => {
    expect(uniqueFileName('', takenIn([]))).toBe(DEFAULT_DOWNLOAD_NAME)
    expect(uniqueFileName('   ', takenIn([DEFAULT_DOWNLOAD_NAME]))).toBe(
      `${DEFAULT_DOWNLOAD_NAME} (1)`
    )
  })
})
