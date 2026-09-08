/**
 * Dělení T-SQL skriptu na dávky podle řádků `GO`.
 *
 * `GO` není příkaz SQL Serveru, rozumí mu jen klientské nástroje (sqlcmd, SSMS).
 * Ovladač dostane každou dávku zvlášť - to je nutné třeba u `CREATE PROCEDURE`,
 * které musí být v dávce první. Oddělovačem je jen řádek, na kterém je `GO`
 * samotné (velikost písmen nehraje roli, smí za ním být počet opakování
 * a řádkový komentář). `GO` uprostřed textu nebo v řetězci se nedělí.
 */

const ODDELOVAC = /^\s*go(?:\s+(\d+))?\s*(?:--.*)?$/i

/**
 * @param {string} text
 * @returns {{ text: string, radek: number }[]} dávky s číslem řádku, kde ve
 *   zdrojovém souboru začínají (1 = první řádek) - kvůli hlášení chyb
 */
export function rozdelNaDavkyPodrobne(text) {
  const radky = text.replace(/^﻿/, '').split(/\r?\n/)
  const davky = []
  let aktualni = []
  let zacatek = 1

  const uzavri = (opakovani) => {
    const obsah = aktualni.join('\n').trim()
    if (obsah) {
      for (let i = 0; i < opakovani; i++) davky.push({ text: obsah, radek: zacatek })
    }
    aktualni = []
  }

  radky.forEach((radek, index) => {
    const shoda = ODDELOVAC.exec(radek)
    if (shoda) {
      uzavri(shoda[1] ? Number(shoda[1]) : 1)
      return
    }
    if (aktualni.length === 0) zacatek = index + 1
    aktualni.push(radek)
  })
  uzavri(1)

  return davky
}

/** @param {string} text @returns {string[]} */
export function rozdelNaDavky(text) {
  return rozdelNaDavkyPodrobne(text).map((davka) => davka.text)
}
