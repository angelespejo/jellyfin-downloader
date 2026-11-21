import assert from 'node:assert/strict'
import test from 'node:test'
import {
  resolveLocaleFromAcceptLanguage,
  translate,
  translateError,
  isLocaleMode,
} from '../../src/lib/i18n/translate.ts'

test('resolves Spanish, Catalan, English and unsupported browser languages', () => {
  assert.equal(resolveLocaleFromAcceptLanguage('es-ES,es;q=0.9,en;q=0.8'), 'es')
  assert.equal(resolveLocaleFromAcceptLanguage('ca-ES,ca;q=0.9,es;q=0.8'), 'ca')
  assert.equal(resolveLocaleFromAcceptLanguage('en-US,en;q=0.9'), 'en')
  assert.equal(resolveLocaleFromAcceptLanguage('fr-FR,fr;q=0.9'), 'en')
  assert.equal(resolveLocaleFromAcceptLanguage(null), 'en')
})

test('locale mode validation accepts auto and all supported languages', () => {
  assert.equal(isLocaleMode('auto'), true)
  assert.equal(isLocaleMode('ca'), true)
  assert.equal(isLocaleMode('fr'), false)
  assert.equal(isLocaleMode(undefined), false)
})

test('translates UI strings and interpolates parameters', () => {
  assert.equal(translate('en', 'movies.title'), 'Library')
  assert.equal(translate('es', 'movies.title'), 'Biblioteca')
  assert.equal(translate('ca', 'movies.title'), 'Biblioteca')
  assert.equal(translate('ca', 'movies.count', { count: 3 }), '3 resultats')
  assert.equal(translate('en', 'status.stage.ready'), 'Ready')
})

test('translates error codes with a localized fallback', () => {
  assert.match(translateError('es', 'MOVIE_NOT_FOUND', null), /Jellyfin/)
  assert.match(translateError('ca', 'BURN_UNSUPPORTED', null), /ffmpeg/)
  assert.equal(translateError('en', 'UNKNOWN_CODE', 'fallback'), 'fallback')
})
