import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rozdelNaDavky } from './davky.mjs'

test('skript bez GO je jedna dávka', () => {
  assert.deepEqual(rozdelNaDavky('select 1;\nselect 2;'), ['select 1;\nselect 2;'])
})

test('GO na samostatném řádku dělí dávky', () => {
  const text = 'create table a (id int)\nGO\ncreate table b (id int)\nGO\n'
  assert.deepEqual(rozdelNaDavky(text), ['create table a (id int)', 'create table b (id int)'])
})

test('GO nezáleží na velikosti písmen a snese mezery i komentář', () => {
  const text = 'select 1\n  go  \nselect 2\nGO -- konec\nselect 3'
  assert.deepEqual(rozdelNaDavky(text), ['select 1', 'select 2', 'select 3'])
})

test('GO uprostřed řádku není oddělovač', () => {
  const text = "select 'GO' as slovo\nprint 'Let it GO'"
  assert.deepEqual(rozdelNaDavky(text), [text])
})

test('prázdné dávky se vynechají', () => {
  assert.deepEqual(rozdelNaDavky('GO\n\nGO\nselect 1\nGO\n\n'), ['select 1'])
})

test('řádky s CRLF a BOM na začátku', () => {
  const text = '﻿select 1\r\nGO\r\nselect 2\r\n'
  assert.deepEqual(rozdelNaDavky(text), ['select 1', 'select 2'])
})

test('GO s počtem opakování dávku zopakuje', () => {
  assert.deepEqual(rozdelNaDavky('insert x default values\nGO 3\n'), [
    'insert x default values',
    'insert x default values',
    'insert x default values',
  ])
})
