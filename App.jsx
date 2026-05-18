import React, { useState, useEffect, useMemo } from "react";

/*
  NAME THAT DUDE — daily MLB player guessing game
  ===============================================
  TWO MODES, auto-detected at load:

  • SERVER MODE (anti-cheat): if /api/today responds, the answer lives only
    on the server. The browser never receives the name until the game ends
    (correct guess or all strikes used). Guesses are validated server-side.
    Nothing in the JS bundle or the initial page load reveals the answer.

  • LOCAL MODE (fallback): if there's no /api (e.g. pure static host, or
    this file running inside an artifact), it uses a baked players.json or
    the built-in roster, exactly as before. Fully playable.

  Difficulty (Rookie / Veteran / All-Star) controls how many clues you
  start with; hidden clues unlock in the bonus round. Difficulty locks
  once you guess. Streaks/stats persist via window.storage (a localStorage
  shim is installed in main.jsx for the real website).
*/

const API_BASE = "";                 // same origin
const DATA_URL = "data/players.json"; // local-mode baked dataset
const CONFIG = { maxStrikes: 3, bonusGuess: true, progressiveHints: false };

const DIFFICULTY = {
  rookie:  { label: "Rookie",   base: ["pos", "num", "teams"] },
  veteran: { label: "Veteran",  base: ["pos", "teams"] },
  allstar: { label: "All-Star", base: ["pos"] },
};

const P = (name, pos, num, teams, years, season, accolades) =>
  ({ name, pos, num, teams, years, season, accolades });

const PLAYERS = [
  P("Brandon Phillips", "2B", 4, ["Indians", "Reds", "Braves", "Angels"], "2002–2018", "2007: .288, 30 HR, 32 SB (30–30 season)", "4 Gold Gloves · 3× All-Star · Silver Slugger"),
  P("Rickey Henderson", "LF", 24, ["Athletics", "Yankees", "others"], "1979–2003", "1990: .325, 28 HR, 65 SB (AL MVP)", "All-time SB leader (1,406) · HOF 2009"),
  P("Cal Ripken Jr.", "SS", 8, ["Orioles"], "1981–2001", "1991: .323, 34 HR, 114 RBI (AL MVP)", "2,632 straight games · 19× All-Star · HOF 2007"),
  P("Tony Gwynn", "RF", 19, ["Padres"], "1982–2001", "1994: .394 AVG", "8× batting champ · .338 career · HOF 2007"),
  P("Nolan Ryan", "SP", 34, ["Mets", "Angels", "Astros", "Rangers"], "1966–1993", "1973: 383 K (single-season record)", "7 no-hitters · 5,714 K · HOF 1999"),
  P("Wade Boggs", "3B", 26, ["Red Sox", "Yankees", "Rays"], "1982–1999", "1987: .363, 24 HR, 200 hits", "5× batting champ · 3,010 hits · HOF 2005"),
  P("Ozzie Smith", "SS", 1, ["Padres", "Cardinals"], "1978–1996", "Defensive wizard; 1985 NLCS walk-off", "13 Gold Gloves · 15× All-Star · HOF 2002"),
  P("Kirby Puckett", "CF", 34, ["Twins"], "1984–1995", "1988: .356, 24 HR, 121 RBI", "2× WS champ · 10× All-Star · HOF 2001"),
  P("Roger Clemens", "SP", 21, ["Red Sox", "Blue Jays", "Yankees", "Astros"], "1984–2007", "1997: 21-7, 2.05 ERA, 292 K", "7× Cy Young · 4,672 K"),
  P("Don Mattingly", "1B", 23, ["Yankees"], "1982–1995", "1985: .324, 35 HR, 145 RBI (AL MVP)", "9 Gold Gloves · 6× All-Star"),
  P("Ryne Sandberg", "2B", 23, ["Cubs"], "1981–1997", "1990: .306, 40 HR, 100 RBI", "1984 NL MVP · 9 Gold Gloves · HOF 2005"),
  P("Dale Murphy", "CF", 3, ["Braves"], "1976–1993", "1983: .302, 36 HR, 121 RBI", "2× NL MVP · 5 Gold Gloves"),
  P("George Brett", "3B", 5, ["Royals"], "1973–1993", "1980: .390 AVG (AL MVP)", "3,154 hits · 1985 WS champ · HOF 1999"),
  P("Mike Schmidt", "3B", 20, ["Phillies"], "1972–1989", "1980: 48 HR, 121 RBI (NL MVP)", "3× NL MVP · 548 HR · HOF 1995"),
  P("Eddie Murray", "1B", 33, ["Orioles", "Dodgers", "Mets", "Indians"], "1977–1997", "1983: .306, 33 HR, 111 RBI", "3,255 hits · 504 HR · HOF 2003"),
  P("Andre Dawson", "RF", 10, ["Expos", "Cubs"], "1976–1996", "1987: 49 HR, 137 RBI (NL MVP)", "8 Gold Gloves · 438 HR · HOF 2010"),
  P("Paul Molitor", "DH/3B", 4, ["Brewers", "Blue Jays", "Twins"], "1978–1998", "1993: .332, 211 hits (WS MVP)", "3,319 hits · HOF 2004"),
  P("Robin Yount", "SS/CF", 19, ["Brewers"], "1974–1993", "1982: .331, 29 HR (AL MVP)", "2× MVP · 3,142 hits · HOF 1999"),
  P("Dennis Eckersley", "RP", 43, ["Indians", "Athletics", "others"], "1975–1998", "1992: 51 SV, 1.91 ERA (MVP + Cy Young)", "390 saves · HOF 2004"),
  P("Goose Gossage", "RP", 54, ["Yankees", "Padres", "others"], "1972–1994", "1978: 27 SV, 2.01 ERA", "310 saves · HOF 2008"),
  P("Dave Winfield", "RF", 31, ["Padres", "Yankees", "Blue Jays"], "1973–1995", "1979: .308, 34 HR, 118 RBI", "3,110 hits · 7 Gold Gloves · HOF 2001"),
  P("Carlton Fisk", "C", 72, ["Red Sox", "White Sox"], "1969–1993", "1975 WS Game 6 walk-off HR", "11× All-Star · 376 HR · HOF 2000"),
  P("Gary Carter", "C", 8, ["Expos", "Mets"], "1974–1992", "1986 WS champ with Mets", "11× All-Star · 3 Gold Gloves · HOF 2003"),
  P("Tim Raines", "LF", 30, ["Expos", "White Sox", "others"], "1979–2002", "1987: .330, 50 SB", "808 SB · 7× All-Star · HOF 2017"),
  P("Alan Trammell", "SS", 3, ["Tigers"], "1977–1996", "1984 WS MVP", "1984 WS champ · 6× All-Star · HOF 2018"),
  P("Jack Morris", "SP", 47, ["Tigers", "Twins", "Blue Jays"], "1977–1994", "1991 WS Game 7: 10-inning shutout", "4× WS champ · HOF 2018"),
  P("Fernando Valenzuela", "SP", 34, ["Dodgers"], "1980–1997", "1981: Cy Young + ROY ('Fernandomania')", "1981 WS champ · 6× All-Star"),
  P("Greg Maddux", "SP", 31, ["Cubs", "Braves", "Dodgers", "Padres"], "1986–2008", "1995: 19-2, 1.63 ERA", "4× Cy Young · 18 Gold Gloves · HOF 2014"),
  P("Randy Johnson", "SP", 51, ["Mariners", "Astros", "Diamondbacks", "Yankees", "Giants"], "1988–2009", "2002: 24-5, 2.32 ERA, 334 K", "5× Cy Young · 2001 WS MVP · HOF 2015"),
  P("Pedro Martinez", "SP", 45, ["Expos", "Red Sox", "Mets", "Phillies"], "1992–2009", "2000: 1.74 ERA, 284 K", "3× Cy Young · 2004 WS champ · HOF 2015"),
  P("Tom Glavine", "SP", 47, ["Braves", "Mets"], "1987–2008", "1991 & 1998 NL Cy Young", "305 wins · 1995 WS MVP · HOF 2014"),
  P("John Smoltz", "SP", 29, ["Braves"], "1988–2009", "1996: 24-8, Cy Young", "213 wins + 154 saves · HOF 2015"),
  P("Frank Thomas", "1B/DH", 35, ["White Sox", "Athletics", "Blue Jays"], "1990–2008", "1994: .353, 38 HR (AL MVP)", "2× AL MVP · 521 HR · HOF 2014"),
  P("Ken Griffey Jr.", "CF", 24, ["Mariners", "Reds", "White Sox"], "1989–2010", "1997: .304, 56 HR, 147 RBI (MVP)", "13× All-Star · 630 HR · HOF 2016"),
  P("Barry Bonds", "LF", 25, ["Pirates", "Giants"], "1986–2007", "2001: 73 HR (single-season record)", "7× MVP · 762 HR (all-time)"),
  P("Chipper Jones", "3B", 10, ["Braves"], "1993–2012", "1999: .319, 45 HR (NL MVP)", "1995 WS champ · 8× All-Star · HOF 2018"),
  P("Mike Piazza", "C", 31, ["Dodgers", "Mets"], "1992–2007", "1997: .362, 40 HR, 124 RBI", "12× All-Star · 427 HR · HOF 2016"),
  P("Jeff Bagwell", "1B", 5, ["Astros"], "1991–2005", "1994: .368, 39 HR, 116 RBI (MVP)", "449 HR · 1991 ROY · HOF 2017"),
  P("Craig Biggio", "2B", 7, ["Astros"], "1988–2007", "1997: .309, 22 HR, 47 SB", "3,060 hits · 7× All-Star · HOF 2015"),
  P("Sammy Sosa", "RF", 21, ["Cubs", "White Sox", "Rangers"], "1989–2007", "1998: 66 HR, 158 RBI (NL MVP)", "609 HR · 7× All-Star"),
  P("Mark McGwire", "1B", 25, ["Athletics", "Cardinals"], "1986–2001", "1998: 70 HR", "583 HR · 1987 AL ROY"),
  P("Roberto Alomar", "2B", 12, ["Blue Jays", "Orioles", "Indians"], "1988–2004", "1996: .328, 132 runs", "10 Gold Gloves · 2× WS champ · HOF 2011"),
  P("Larry Walker", "RF", 33, ["Expos", "Rockies", "Cardinals"], "1989–2005", "1997: .366, 49 HR (NL MVP)", "7 Gold Gloves · HOF 2020"),
  P("Barry Larkin", "SS", 11, ["Reds"], "1986–2004", "1995 NL MVP", "1990 WS champ · 12× All-Star · HOF 2012"),
  P("Edgar Martinez", "DH", 11, ["Mariners"], "1987–2004", "1995: .356, 29 HR, .479 OBP", "2× batting champ · HOF 2019"),
  P("Trevor Hoffman", "RP", 51, ["Padres", "Brewers"], "1993–2010", "1998: 53 SV, 1.48 ERA", "601 saves · HOF 2018"),
  P("Curt Schilling", "SP", 38, ["Phillies", "Diamondbacks", "Red Sox"], "1988–2007", "2001 WS co-MVP", "3× WS champ · 3,116 K"),
  P("Ivan Rodriguez", "C", 7, ["Rangers", "Tigers", "others"], "1991–2011", "1999 AL MVP", "13 Gold Gloves · 2003 WS champ · HOF 2017"),
  P("Gary Sheffield", "RF", 11, ["Marlins", "Dodgers", "Yankees", "others"], "1988–2009", "1992: .330, 33 HR (batting title)", "509 HR · 9× All-Star"),
  P("Jeff Kent", "2B", 21, ["Giants", "Astros", "Dodgers", "others"], "1992–2008", "2000 NL MVP", "377 HR (most by a 2B) · 5× All-Star"),
  P("Kenny Lofton", "CF", 7, ["Indians", "others"], "1991–2007", "1996: .317, 75 SB", "622 SB · 4 Gold Gloves"),
  P("Jim Edmonds", "CF", 15, ["Angels", "Cardinals"], "1993–2010", "2004: .301, 42 HR", "8 Gold Gloves · 2006 WS champ"),
  P("Andy Pettitte", "SP", 46, ["Yankees", "Astros"], "1995–2013", "2005: 17-9, 2.39 ERA", "256 wins · 5× WS champ"),
  P("Jorge Posada", "C", 20, ["Yankees"], "1995–2011", "2007: .338, 20 HR", "5× All-Star · 4× WS champ"),
  P("Manny Ramirez", "LF", 24, ["Indians", "Red Sox", "Dodgers"], "1993–2011", "1999: .333, 44 HR, 165 RBI", "2× WS champ · 2004 WS MVP · 555 HR"),
  P("Jim Thome", "1B/DH", 25, ["Indians", "Phillies", "others"], "1991–2012", "2002: 52 HR, 118 RBI", "612 HR · HOF 2018"),
  P("Mariano Rivera", "RP", 42, ["Yankees"], "1995–2013", "2004: 1.94 ERA, 53 SV", "652 saves (all-time) · unanimous HOF 2019"),
  P("Derek Jeter", "SS", 2, ["Yankees"], "1995–2014", "1999: .349, 24 HR, 102 RBI", "5× WS champ · 3,465 hits · HOF 2020"),
  P("Albert Pujols", "1B", 5, ["Cardinals", "Angels", "Dodgers"], "2001–2022", "2009: .327, 47 HR, 135 RBI", "3× MVP · 700+ HR"),
  P("Ichiro Suzuki", "RF", 51, ["Mariners", "Yankees", "Marlins"], "2001–2019", "2004: 262 hits (single-season record)", "2001 MVP & ROY · HOF 2025"),
  P("David Ortiz", "DH", 34, ["Twins", "Red Sox"], "1997–2016", "2006: 54 HR, 137 RBI", "3× WS champ · HOF 2022"),
  P("Vladimir Guerrero", "RF", 27, ["Expos", "Angels", "Rangers", "Orioles"], "1996–2011", "2004 AL MVP", "9× All-Star · HOF 2018"),
  P("Miguel Cabrera", "1B/3B", 24, ["Marlins", "Tigers"], "2003–2023", "2012 Triple Crown: .330, 44 HR, 139 RBI", "2× AL MVP · 3,000 hits + 500 HR"),
  P("Adrian Beltre", "3B", 29, ["Dodgers", "Mariners", "Red Sox", "Rangers"], "1998–2018", "2004: .334, 48 HR", "3,000 hits · 5 Gold Gloves · HOF 2024"),
  P("Roy Halladay", "SP", 34, ["Blue Jays", "Phillies"], "1998–2013", "2010: perfect game + playoff no-hitter", "2× Cy Young · HOF 2019"),
  P("CC Sabathia", "SP", 52, ["Indians", "Brewers", "Yankees"], "2001–2019", "2007 AL Cy Young", "251 wins · 3,000 K · 2009 WS champ"),
  P("Johan Santana", "SP", 57, ["Twins", "Mets"], "2000–2012", "2004 & 2006 AL Cy Young", "First Mets no-hitter (2012)"),
  P("Carlos Beltran", "CF", 15, ["Royals", "Astros", "Mets", "Yankees"], "1998–2017", "2004 postseason: 8 HR", "9× All-Star · 2017 WS champ"),
  P("Joe Mauer", "C", 7, ["Twins"], "2004–2018", "2009: .365, 28 HR (AL MVP)", "3× batting champ · HOF 2024"),
  P("Yadier Molina", "C", 4, ["Cardinals"], "2004–2022", "9 Gold Gloves behind the plate", "2× WS champ · 10× All-Star"),
  P("Robinson Cano", "2B", 24, ["Yankees", "Mariners", "Mets"], "2005–2022", "2010: .319, 29 HR", "8× All-Star · 2009 WS champ"),
  P("Justin Verlander", "SP", 35, ["Tigers", "Astros", "Mets"], "2005–present", "2011: 24-5, 250 K (Cy Young + MVP)", "3× Cy Young · 2× WS champ"),
  P("Felix Hernandez", "SP", 34, ["Mariners"], "2005–2019", "2010 AL Cy Young; 2012 perfect game", "6× All-Star"),
  P("David Wright", "3B", 5, ["Mets"], "2004–2018", "2007: .325, 30 HR, 34 SB", "7× All-Star · 2 Gold Gloves"),
  P("Ryan Howard", "1B", 6, ["Phillies"], "2004–2016", "2006: 58 HR, 149 RBI (NL MVP)", "2008 WS champ · 2005 ROY"),
  P("Chase Utley", "2B", 26, ["Phillies", "Dodgers"], "2003–2018", "2009 WS: 5 HR", "2008 WS champ · 6× All-Star"),
  P("Jimmy Rollins", "SS", 11, ["Phillies"], "2000–2016", "2007 NL MVP", "4 Gold Gloves · 2008 WS champ"),
  P("Joey Votto", "1B", 19, ["Reds"], "2007–2023", "2010 NL MVP", "6× All-Star · elite OBP"),
  P("Dustin Pedroia", "2B", 15, ["Red Sox"], "2006–2019", "2008 AL MVP", "2007 ROY · 2× WS champ"),
  P("Buster Posey", "C", 28, ["Giants"], "2009–2021", "2012: .336, 24 HR (NL MVP)", "3× WS champ · 2010 ROY"),
  P("Troy Tulowitzki", "SS", 2, ["Rockies", "Blue Jays"], "2006–2019", "2010: .315, 27 HR", "5× All-Star · 2 Gold Gloves"),
  P("Prince Fielder", "1B", 28, ["Brewers", "Tigers", "Rangers"], "2005–2016", "2007: 50 HR", "6× All-Star"),
  P("Cole Hamels", "SP", 35, ["Phillies", "Rangers", "Cubs"], "2006–2020", "2008 WS MVP & NLCS MVP", "4× All-Star"),
  P("Clayton Kershaw", "SP", 22, ["Dodgers"], "2008–present", "2014: 21-3, 1.77 ERA (Cy Young + MVP)", "3× Cy Young · 2020 WS champ"),
  P("Mike Trout", "CF", 27, ["Angels"], "2011–present", "2012: .326, 30 HR, 49 SB", "3× AL MVP · 11× All-Star"),
  P("Bryce Harper", "RF", 34, ["Nationals", "Phillies"], "2012–present", "2015: .330, 42 HR (NL MVP)", "2× MVP · 2012 ROY"),
  P("Mookie Betts", "RF", 50, ["Red Sox", "Dodgers"], "2014–present", "2018: .346, 32 HR (AL MVP)", "2× WS champ · 6 Gold Gloves"),
  P("Aaron Judge", "RF", 99, ["Yankees"], "2016–present", "2022: 62 HR (AL record), MVP", "2017 ROY · multi-time MVP"),
  P("Jose Altuve", "2B", 27, ["Astros"], "2011–present", "2017: .346, 24 HR (AL MVP)", "2× WS champ · batting titles"),
  P("Freddie Freeman", "1B", 5, ["Braves", "Dodgers"], "2010–present", "2020 NL MVP; 2024 WS MVP", "2× WS champ · 8× All-Star"),
  P("Nolan Arenado", "3B", 28, ["Rockies", "Cardinals"], "2013–present", "Four straight 40-HR/130-RBI seasons", "10 Gold Gloves"),
  P("Manny Machado", "3B/SS", 13, ["Orioles", "Padres"], "2012–present", "2022: .298, 32 HR", "Multi-time All-Star · Gold Glove"),
  P("Francisco Lindor", "SS", 12, ["Guardians", "Mets"], "2015–present", "2018: 38 HR, 25 SB", "4× All-Star · 2 Gold Gloves"),
  P("Max Scherzer", "SP", 31, ["Tigers", "Nationals", "Dodgers", "Mets"], "2008–present", "2013, 2016 & 2017 Cy Young", "3× Cy Young · 2019 WS champ · 3,000 K"),
  P("Jacob deGrom", "SP", 48, ["Mets", "Rangers"], "2014–present", "2018 & 2019 NL Cy Young", "2014 NL ROY"),
  P("Shohei Ohtani", "DH/SP", 17, ["Angels", "Dodgers"], "2018–present", "2024: 54 HR / 59 SB (50-50)", "3× MVP · 2018 AL ROY"),
  P("Ronald Acuna Jr.", "RF", 13, ["Braves"], "2018–present", "2023: 41 HR / 73 SB, NL MVP", "2018 NL ROY · 2021 WS champ"),
  P("Juan Soto", "RF", 22, ["Nationals", "Padres", "Yankees", "Mets"], "2018–present", "2020 NL batting title at age 21", "2019 WS champ · elite OBP"),
  P("Gerrit Cole", "SP", 45, ["Pirates", "Astros", "Yankees"], "2013–present", "2019: 20-5, 2.50 ERA, 326 K", "2023 AL Cy Young"),
  P("Paul Goldschmidt", "1B", 46, ["Diamondbacks", "Cardinals"], "2011–present", "2022 NL MVP", "4 Gold Gloves · multi All-Star"),
  P("Christian Yelich", "LF", 22, ["Marlins", "Brewers"], "2013–present", "2018: .326, 36 HR (NL MVP)", "Batting title · Silver Sluggers"),
  P("Giancarlo Stanton", "RF", 27, ["Marlins", "Yankees"], "2010–present", "2017: 59 HR, 132 RBI (NL MVP)", "5× All-Star · prodigious power"),
];

// ── LAUNCH DATE ──────────────────────────────────────────────────────
// Set this to the calendar day you go live. Puzzle #1 = launch day, and
// puzzle #1 is always Brandon Phillips (the opener). Keep this IDENTICAL
// to EPOCH in server/core.js (same year, month-1, day).
// Example: launching 2026-05-20  ->  new Date(2026, 4, 20)
const EPOCH = new Date(2025, 0, 1);
const FIRST_PLAYER = "Brandon Phillips";
// ─────────────────────────────────────────────────────────────────────
function getDayNumber() {
  const n = new Date();
  const t = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.floor((t - EPOCH) / 86400000) + 1;
}
function dailyIndex(d, len) {
  const h = (d * 2654435761) % 2 ** 31;
  return Math.abs(h) % len;
}
// Mirrors server/core.js playerForDay so both modes agree.
function pickPlayer(day, list) {
  const fi = list.findIndex((p) => p.name === FIRST_PLAYER);
  if (day <= 1 && fi >= 0) return list[fi];
  let i = dailyIndex(day, list.length);
  if (i === fi) i = (i + 1) % list.length;
  return list[i];
}

const STATS_KEY = "ntd:stats:v1";
const DIFF_KEY = "ntd:difficulty";
const todayKey = (d) => `ntd:day:${d}`;

const DATA_BASE = DATA_URL.replace(/[^/]*$/, "");
const joinData = (p) =>
  !p ? null : /^https?:\/\//.test(p) || p.startsWith("/") ? p : DATA_BASE + p;
const mlbImg = (id) =>
  `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_426,q_auto:best/v1/people/${id}/headshot/67/current`;

async function searchMlbId(name) {
  const r = await fetch(`https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(name)}`);
  if (!r.ok) throw new Error("search failed");
  const ppl = (await r.json())?.people || [];
  if (!ppl.length) throw new Error("no match");
  const exact = ppl.find((p) => (p.fullName || "").toLowerCase() === name.toLowerCase());
  return (exact || ppl[0]).id;
}

function mergeRecord(baked) {
  const c = PLAYERS.find((p) => p.name.toLowerCase() === (baked.name || "").toLowerCase());
  return {
    name: baked.name,
    pos: baked.pos || c?.pos || "?",
    num: baked.num ?? c?.num ?? "?",
    teams: baked.teams?.length ? baked.teams : c?.teams || [],
    years: baked.years || c?.years || "",
    season: baked.season || c?.season || "",
    accolades: baked.accolades || c?.accolades || "",
    id: baked.id ?? null,
    silhouette: joinData(baked.silhouette),
    photo: joinData(baked.photo),
  };
}

function StatBox({ label, value }) {
  return (
    <div className="flex flex-col items-center px-2">
      <div className="text-3xl font-black tabular-nums" style={{ fontFamily: "Anton, sans-serif" }}>{value}</div>
      <div className="text-[10px] uppercase tracking-widest opacity-60 mt-1">{label}</div>
    </div>
  );
}

function DrawnSilhouette({ revealed }) {
  return (
    <svg viewBox="0 0 200 240" className="w-full h-full">
      <g fill={revealed ? "#c8102e" : "#0a0a0a"} opacity={revealed ? 0.85 : 0.92}>
        <circle cx="92" cy="64" r="17" />
        <path d="M75 60 a17 17 0 0 1 34 0 l4 -2 a21 21 0 0 0 -42 0 z" />
        <path d="M82 80 q10 -6 22 0 l8 46 q-19 8 -38 0 z" />
        <path d="M84 122 l-6 56 14 0 8 -52 z" />
        <path d="M104 122 l18 30 -2 14 -10 -2 -16 -34 z" />
        <rect x="74" y="176" width="22" height="8" rx="3" />
        <rect x="112" y="160" width="22" height="8" rx="3" transform="rotate(20 123 164)" />
        <path d="M102 86 q22 -6 34 -20 l6 6 q-14 18 -34 26 z" />
        <path d="M98 92 q20 0 34 -14 l5 6 q-16 16 -36 20 z" />
        <rect x="128" y="34" width="46" height="9" rx="4" transform="rotate(-38 128 34)" />
      </g>
      {!revealed && (
        <text x="100" y="128" textAnchor="middle" fontSize="74" fontWeight="900"
          fill="#c8102e" opacity="0.9" style={{ fontFamily: "Anton, sans-serif" }}>?</text>
      )}
    </svg>
  );
}

// Resolves an image from: explicit src pair (server mode / baked files) ->
// MLBAM id -> live name search -> drawn fallback.
function Portrait({ silSrc, photoSrc, mlbId, name, needsFilter, revealed }) {
  const [resolved, setResolved] = useState({ sil: silSrc || null, photo: photoSrc || null, filter: !!needsFilter });
  const [state, setState] = useState(silSrc ? "ok-src" : "loading");

  useEffect(() => {
    let alive = true;
    if (silSrc) { setResolved({ sil: silSrc, photo: photoSrc || silSrc, filter: false }); setState("ok-src"); return; }
    if (mlbId) { const u = mlbImg(mlbId); setResolved({ sil: u, photo: u, filter: true }); setState("ok-src"); return () => { alive = false; }; }
    if (name) {
      setState("loading");
      searchMlbId(name)
        .then((id) => { if (alive) { const u = mlbImg(id); setResolved({ sil: u, photo: u, filter: true }); setState("ok-src"); } })
        .catch(() => alive && setState("fail"));
    } else {
      setState("fail");
    }
    return () => { alive = false; };
  }, [silSrc, photoSrc, mlbId, name]);

  if (state === "fail" || (!resolved.sil && !resolved.photo)) return <DrawnSilhouette revealed={revealed} />;

  const src = revealed ? resolved.photo : resolved.sil;
  if (revealed && !resolved.photo) return <DrawnSilhouette revealed />;

  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-[#1e3a5f] to-[#0c1c2e]">
      <img
        src={src}
        alt={revealed ? name || "Player" : "Mystery player"}
        onError={() => setState("fail")}
        className="w-full h-full object-contain transition-all duration-700"
        style={{
          filter: resolved.filter && !revealed ? "brightness(0) saturate(100%)" : "none",
          transform: revealed ? "scale(1.02)" : "scale(1)",
        }}
      />
    </div>
  );
}

export default function NameThatDude() {
  const [mode, setMode] = useState(null);          // 'server' | 'local'
  const [day, setDay] = useState(null);
  const [roster, setRoster] = useState(null);      // local mode
  const [serverClues, setServerClues] = useState(null); // server mode
  const [serverSil, setServerSil] = useState(null);
  const [namePool, setNamePool] = useState([]);
  const [revealed, setRevealed] = useState(null);  // {name, photo}
  const [source, setSource] = useState("");

  const [loaded, setLoaded] = useState(false);
  const [guesses, setGuesses] = useState([]);
  const [status, setStatus] = useState("playing");
  const [difficulty, setDifficulty] = useState("rookie");
  const [input, setInput] = useState("");
  const [showDrop, setShowDrop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState({ played: 0, wins: 0, streak: 0, maxStreak: 0, dist: [0, 0, 0, 0] });
  const [showStats, setShowStats] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [shareMsg, setShareMsg] = useState("");
  const [now, setNow] = useState(Date.now());

  // Unified "answer-ish" clue object (name only known once revealed).
  const answer = useMemo(() => {
    if (mode === "server" && serverClues)
      return { ...serverClues, name: revealed?.name || null };
    if (mode === "local" && roster)
      return pickPlayer(day, roster);
    return null;
  }, [mode, serverClues, roster, day, revealed]);

  const strikes = guesses.filter((g) => !g.correct).length;
  const bonusUnlocked = strikes >= CONFIG.maxStrikes;
  const maxGuesses = CONFIG.maxStrikes + (CONFIG.bonusGuess ? 1 : 0);
  const gameOver = status !== "playing";
  const diffLocked = guesses.length > 0 || gameOver;
  const baseClues = DIFFICULTY[difficulty].base;

  // ---- bootstrap ----
  useEffect(() => {
    (async () => {
      let m = "local", d = getDayNumber(), src = "built-in";
      let clues = null, sil = null, names = [], rost = null, serverState = null;

      try {
        const t = await fetch(API_BASE + "/api/today", { cache: "no-store" });
        if (t.ok) {
          const tj = await t.json();
          if (tj && tj.clues) {
            m = "server"; d = tj.day; clues = tj.clues; sil = tj.silhouette || null;
            serverState = tj.state || null;
            src = "secure API";
            try {
              const nr = await fetch(API_BASE + "/api/names", { cache: "no-store" });
              if (nr.ok) names = (await nr.json()).names || [];
            } catch (e) {}
          }
        }
      } catch (e) { /* no API -> local */ }

      if (m === "local") {
        rost = PLAYERS;
        try {
          const r = await fetch(DATA_URL, { cache: "no-store" });
          if (r.ok) {
            const j = await r.json();
            if (Array.isArray(j) && j.length) { rost = j.map(mergeRecord); src = "baked dataset"; }
          }
        } catch (e) {}
        names = rost.map((p) => p.name);
      }

      setMode(m); setDay(d); setServerClues(clues); setServerSil(sil);
      setNamePool(names); setRoster(rost); setSource(src);

      const todayName = m === "local" ? pickPlayer(d, rost).name : null;

      try { const s = await window.storage.get(STATS_KEY); if (s?.value) setStats(JSON.parse(s.value)); } catch (e) {}
      try { const dp = await window.storage.get(DIFF_KEY); if (dp?.value && DIFFICULTY[dp.value]) setDifficulty(dp.value); } catch (e) {}
      try {
        const seen = await window.storage.get("ntd:seen");
        if (!seen?.value) { setShowHelp(true); window.storage.set("ntd:seen", "1"); }
      } catch (e) {}
      try {
        const rec = await window.storage.get(todayKey(d));
        if (rec?.value) {
          const v = JSON.parse(rec.value);
          const sameAnswer = m === "server" || !v.answerName || v.answerName === todayName;
          if (sameAnswer) {
            setGuesses(v.guesses || []);
            setStatus(v.status || "playing");
            if (v.difficulty && DIFFICULTY[v.difficulty]) setDifficulty(v.difficulty);
            if (v.status && v.status !== "playing") {
              if (v.revealed) setRevealed(v.revealed);
              else if (m === "local") setRevealed({ name: todayName, photo: null });
              setShowStats(true);
            }
          }
        }
      } catch (e) {}

      // If the server (authoritative mode) says this browser already
      // finished today — even with cleared localStorage or on another
      // device — trust it and restore the ending.
      if (m === "server" && serverState?.over && status === "playing") {
        try {
          const rr = await fetch(API_BASE + "/api/reveal", { cache: "no-store" });
          if (rr.ok) {
            const jj = await rr.json();
            if (jj.answer) {
              const rev = { name: jj.answer, photo: jj.photo || null };
              setRevealed(rev);
              setStatus(serverState.solved ? "won" : "lost");
              setShowStats(true);
            }
          }
        } catch (e) {}
      }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  async function persistDay(g, st, rev) {
    try {
      await window.storage.set(todayKey(day), JSON.stringify({
        guesses: g, status: st, difficulty,
        answerName: mode === "local" && answer ? answer.name : null,
        revealed: rev ?? revealed ?? null,
      }));
    } catch (e) {}
  }
  async function persistStats(n) { setStats(n); try { await window.storage.set(STATS_KEY, JSON.stringify(n)); } catch (e) {} }

  function pickDifficulty(key) {
    if (diffLocked) return;
    setDifficulty(key);
    try { window.storage.set(DIFF_KEY, key); } catch (e) {}
  }

  function recordStats(won, fg) {
    const dist = [...stats.dist];
    if (won) dist[Math.min(fg.length, maxGuesses) - 1] += 1;
    persistStats({
      played: stats.played + 1,
      wins: stats.wins + (won ? 1 : 0),
      streak: won ? stats.streak + 1 : 0,
      maxStreak: won ? Math.max(stats.maxStreak, stats.streak + 1) : stats.maxStreak,
      dist,
    });
  }

  function finish(won, fg, rev) {
    setStatus(won ? "won" : "lost");
    if (rev) setRevealed(rev);
    persistDay(fg, won ? "won" : "lost", rev);
    recordStats(won, fg);
    setTimeout(() => setShowStats(true), 1400);
  }

  async function submitGuess(value) {
    const text = (value ?? input).trim();
    if (!text || gameOver || busy || !answer) return;
    setInput(""); setShowDrop(false);

    if (mode === "server") {
      setBusy(true);
      let correct = false, over = false, rev = null;
      try {
        const r = await fetch(API_BASE + "/api/guess", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ day, guess: text }),
        });
        const j = await r.json();
        correct = !!j.correct;
        over = !!j.over;
        // Authoritative server already hands back the answer when the
        // game is over (correct OR strikes exhausted). No reveal call.
        if (j.answer) rev = { name: j.answer, photo: joinData(j.photo) };
      } catch (e) { /* network hiccup: treat as a normal wrong, allow retry */ }
      const next = [...guesses, { text, correct }];
      setGuesses(next);
      const ns = next.filter((g) => !g.correct).length;
      if (correct) { finish(true, next, rev); }
      else if (over || ns >= maxGuesses) {
        // Stateless fallback path: server didn't include the answer.
        if (!rev) {
          try {
            const rr = await fetch(API_BASE + "/api/reveal", { cache: "no-store" });
            const jj = await rr.json();
            if (jj.answer) rev = { name: jj.answer, photo: joinData(jj.photo) };
          } catch (e) {}
        }
        finish(false, next, rev);
      } else { persistDay(next, "playing"); }
      setBusy(false);
      return;
    }

    // local mode
    const correct = text.toLowerCase() === answer.name.toLowerCase();
    const next = [...guesses, { text, correct }];
    setGuesses(next);
    if (correct) { finish(true, next, { name: answer.name, photo: answer.photo || null }); return; }
    const ns = next.filter((g) => !g.correct).length;
    if (ns >= maxGuesses) finish(false, next, { name: answer.name, photo: answer.photo || null });
    else persistDay(next, "playing");
  }

  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q) return [];
    const used = new Set(guesses.map((g) => g.text.toLowerCase()));
    return namePool.filter((n) => n.toLowerCase().includes(q) && !used.has(n.toLowerCase())).slice(0, 6);
  }, [input, guesses, namePool]);

  function buildShare() {
    const blocks = guesses.map((g) => (g.correct ? "🟩" : "🟥")).join("");
    const r = status === "won" ? `${guesses.length}/${maxGuesses}` : "X/" + maxGuesses;
    return `⚾ Name That Dude #${day} · ${DIFFICULTY[difficulty].label}  ${r}\n${blocks}\nnamethatdude.com`;
  }
  function share() {
    try { navigator.clipboard.writeText(buildShare()); setShareMsg("Copied to clipboard!"); }
    catch (e) { setShareMsg("Copy failed — select & copy below"); }
    setTimeout(() => setShareMsg(""), 2500);
  }

  const msToMidnight = useMemo(() => {
    const dd = new Date(); return new Date(dd.getFullYear(), dd.getMonth(), dd.getDate() + 1) - now;
  }, [now]);
  const cd = (() => {
    const s = Math.max(0, Math.floor(msToMidnight / 1000));
    return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  })();

  const showBonus = bonusUnlocked || gameOver || CONFIG.progressiveHints;
  const visible = (k) => baseClues.includes(k) || showBonus;
  const winPct = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;

  if (!loaded || !answer) {
    return (
      <div className="min-h-[400px] flex items-center justify-center" style={{ background: "#f4ead5" }}>
        <div className="tracking-widest text-sm text-[#0c1c2e]" style={{ fontFamily: "Barlow Semi Condensed, sans-serif" }}>
          WARMING UP IN THE BULLPEN…
        </div>
      </div>
    );
  }

  const Clue = ({ k, v, locked }) => (
    <div className={`rounded-md border-2 px-3 py-2 ${locked ? "border-dashed border-[#0c1c2e]/25 bg-[#0c1c2e]/5" : "border-[#0c1c2e]/70 bg-[#fffaf0]"}`}>
      <div className="text-[10px] uppercase tracking-[0.18em] text-[#c8102e] font-bold">{k}</div>
      <div className="text-[15px] font-semibold text-[#0c1c2e] mt-0.5" style={{ fontFamily: "Barlow Semi Condensed, sans-serif" }}>
        {locked ? "🔒 Unlocks after strike " + CONFIG.maxStrikes : v}
      </div>
    </div>
  );

  const portraitProps = mode === "server"
    ? { silSrc: serverSil, photoSrc: revealed?.photo || null }
    : { silSrc: answer.silhouette, photoSrc: answer.photo, mlbId: answer.id, name: answer.name };

  return (
    <div style={{ background: "linear-gradient(160deg,#f7eedb 0%,#efe1c4 100%)", fontFamily: "Barlow Semi Condensed, sans-serif" }}
      className="min-h-screen w-full flex justify-center px-4 py-6 text-[#0c1c2e]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Anton&family=Barlow+Semi+Condensed:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        @keyframes pop {0%{transform:scale(.85);opacity:0}60%{transform:scale(1.05)}100%{transform:scale(1);opacity:1}}
        .pop{animation:pop .3s ease-out}
        .scoreboard{box-shadow:0 0 0 3px #0c1c2e,0 0 0 6px #c8102e,0 14px 30px rgba(0,0,0,.35)}
      `}</style>

      <div className="w-full max-w-md">
        <div className="text-center mb-3">
          <div className="text-[11px] tracking-[0.35em] text-[#c8102e] font-bold">DAILY · MLB</div>
          <h1 className="leading-none text-[#0c1c2e]" style={{ fontFamily: "Anton, sans-serif", fontSize: "44px", letterSpacing: "1px" }}>
            NAME THAT DUDE
          </h1>
          <div className="flex items-center justify-center gap-3 mt-1 text-xs tracking-wider opacity-70">
            <span>PUZZLE #{day}</span><span className="opacity-40">|</span>
            <button onClick={() => setShowHelp(true)} className="underline underline-offset-2 hover:text-[#c8102e]">HOW TO PLAY</button>
            <span className="opacity-40">|</span>
            <button onClick={() => setShowStats(true)} className="underline underline-offset-2 hover:text-[#c8102e]">STATS</button>
          </div>
        </div>

        <div className="mb-4">
          <div className="flex rounded-md overflow-hidden border-2 border-[#0c1c2e]">
            {Object.entries(DIFFICULTY).map(([key, dd]) => {
              const on = key === difficulty;
              return (
                <button key={key} onClick={() => pickDifficulty(key)} disabled={diffLocked && !on}
                  className={`flex-1 py-2 text-xs font-bold tracking-widest transition
                    ${on ? "bg-[#c8102e] text-white" : "bg-[#fffaf0] text-[#0c1c2e]"}
                    ${diffLocked && !on ? "opacity-35 cursor-not-allowed" : "hover:bg-[#c8102e]/15"}`}
                  style={{ fontFamily: "Anton, sans-serif", letterSpacing: "1.5px" }}>
                  {dd.label.toUpperCase()}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] opacity-50 mt-1 text-center">
            {diffLocked ? "Difficulty locked for today's puzzle" :
              difficulty === "rookie" ? "All clues shown" :
              difficulty === "veteran" ? "Jersey # hidden until the bonus round" :
              "Only position shown — teams & number hidden until the bonus round"}
          </p>
        </div>

        <div className="scoreboard rounded-lg overflow-hidden mb-4 bg-[#0c1c2e]">
          <div className="aspect-[5/6] max-h-[320px] mx-auto">
            <Portrait {...portraitProps} revealed={gameOver} />
          </div>
          {gameOver && (
            <div className="pop text-center py-3 bg-[#0c1c2e] border-t-2 border-[#c8102e]">
              <div className="text-[10px] tracking-[0.3em] text-[#c8102e]">THE DUDE WAS</div>
              <div className="text-white text-2xl" style={{ fontFamily: "Anton, sans-serif" }}>
                {revealed?.name || answer.name || "—"}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-2 mb-4">
          <span className="text-xs tracking-[0.25em] opacity-60 mr-1">STRIKES</span>
          {Array.from({ length: maxGuesses }).map((_, i) => {
            const g = guesses[i];
            return (
              <div key={i}
                className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-sm font-bold
                  ${!g ? "border-[#0c1c2e]/30" : g.correct ? "bg-emerald-600 border-emerald-700 text-white" : "bg-[#c8102e] border-[#9b0c22] text-white"}
                  ${i === CONFIG.maxStrikes ? "ml-2 border-dashed" : ""}`}
                title={i === CONFIG.maxStrikes ? "Bonus guess" : ""}>
                {g ? (g.correct ? "✓" : "✕") : i === CONFIG.maxStrikes ? "+" : ""}
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <Clue k="Position(s)" v={answer.pos} locked={!visible("pos")} />
          <Clue k="Jersey #" v={`#${answer.num}`} locked={!visible("num")} />
          <div className="col-span-2"><Clue k="Teams" v={(answer.teams || []).join(" · ")} locked={!visible("teams")} /></div>
        </div>

        <div className="grid grid-cols-1 gap-2 mb-4">
          <Clue k="Years Active" v={answer.years} locked={!showBonus} />
          <Clue k="Notable Season" v={answer.season} locked={!showBonus} />
          <Clue k="Accolades" v={answer.accolades} locked={!showBonus} />
        </div>

        {guesses.length > 0 && (
          <div className="space-y-1.5 mb-4">
            {guesses.map((g, i) => (
              <div key={i} className={`pop flex items-center justify-between rounded-md px-3 py-2 text-sm font-semibold ${g.correct ? "bg-emerald-600 text-white" : "bg-[#0c1c2e] text-white"}`}>
                <span>{g.text}</span><span>{g.correct ? "⚾ SAFE!" : "STRIKE"}</span>
              </div>
            ))}
          </div>
        )}

        {!gameOver && (
          <div className="relative mb-2">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => { setInput(e.target.value); setShowDrop(true); }}
                onKeyDown={(e) => { if (e.key === "Enter") submitGuess(); }}
                onFocus={() => setShowDrop(true)}
                placeholder="Name that dude…"
                disabled={busy}
                className="flex-1 rounded-md border-2 border-[#0c1c2e] bg-[#fffaf0] px-3 py-2.5 text-[#0c1c2e] outline-none focus:border-[#c8102e] placeholder:opacity-40 disabled:opacity-50"
              />
              <button onClick={() => submitGuess()} disabled={busy}
                className="rounded-md bg-[#c8102e] px-5 py-2.5 text-white font-bold hover:bg-[#9b0c22] active:scale-95 transition disabled:opacity-50"
                style={{ fontFamily: "Anton, sans-serif", letterSpacing: "1px" }}>
                {busy ? "…" : "SWING"}
              </button>
            </div>
            {showDrop && suggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-md border-2 border-[#0c1c2e] bg-[#fffaf0] overflow-hidden shadow-xl">
                {suggestions.map((s) => (
                  <button key={s} onClick={() => submitGuess(s)} className="block w-full text-left px-3 py-2 text-sm hover:bg-[#c8102e] hover:text-white transition">{s}</button>
                ))}
              </div>
            )}
            <p className="text-[11px] opacity-50 mt-2 text-center">
              {bonusUnlocked ? "Bonus clues unlocked — one final swing!" : `Strike ${strikes}/${CONFIG.maxStrikes} · more clues unlock after ${CONFIG.maxStrikes} strikes`}
            </p>
          </div>
        )}

        {gameOver && (
          <div className={`pop rounded-lg p-4 text-center text-white mb-3 ${status === "won" ? "bg-emerald-600" : "bg-[#c8102e]"}`}>
            <div className="text-2xl" style={{ fontFamily: "Anton, sans-serif" }}>{status === "won" ? "🎉 NICE GRAB!" : "⚾ STRUCK OUT"}</div>
            <div className="text-sm opacity-90 mt-1">{status === "won" ? `Got it in ${guesses.length} ${guesses.length === 1 ? "guess" : "guesses"} · ${DIFFICULTY[difficulty].label}` : "Better luck tomorrow"}</div>
            <button onClick={share} className="mt-3 rounded-md bg-white/15 hover:bg-white/25 px-5 py-2 text-sm font-bold tracking-widest border border-white/40">SHARE RESULT</button>
            {shareMsg && <div className="text-xs mt-2 opacity-90">{shareMsg}</div>}
            <div className="text-xs opacity-80 mt-3">Next dude in <span className="font-mono">{cd}</span></div>
          </div>
        )}

        <div className="text-center text-[11px] opacity-40 mt-4">
          {namePool.length} dudes · {source} · new puzzle at midnight ·{" "}
          <a href="/credits.html" className="underline hover:text-[#c8102e]">image credits</a>
        </div>
      </div>

      {showHelp && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={() => setShowHelp(false)}>
          <div className="bg-[#f7eedb] rounded-lg max-w-sm w-full p-6 border-4 border-[#0c1c2e]" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h2 style={{ fontFamily: "Anton, sans-serif" }} className="text-2xl text-[#0c1c2e]">HOW TO PLAY</h2>
              <button onClick={() => setShowHelp(false)} className="text-[#0c1c2e] text-xl leading-none hover:text-[#c8102e]">✕</button>
            </div>
            <div className="text-sm text-[#0c1c2e] space-y-2 leading-relaxed">
              <p>A new mystery MLB player every day. Name him from his silhouette and clues.</p>
              <p>You get <b>3 strikes</b>. Each wrong guess is a strike. Start typing a name and pick from the list.</p>
              <p>Survive all 3 strikes and the <b>bonus clues</b> unlock — plus one final swing.</p>
              <p><b>Difficulty</b> sets how much you start with: Rookie shows everything, Veteran hides his number, All-Star shows only his position. It locks once you guess.</p>
              <p>One puzzle a day for everyone. Come back at midnight for the next dude.</p>
            </div>
            <button onClick={() => setShowHelp(false)} className="w-full mt-4 rounded-md bg-[#c8102e] hover:bg-[#9b0c22] text-white py-2.5 font-bold tracking-widest" style={{ fontFamily: "Anton, sans-serif" }}>
              PLAY BALL
            </button>
          </div>
        </div>
      )}

      {showStats && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={() => setShowStats(false)}>
          <div className="bg-[#f7eedb] rounded-lg max-w-sm w-full p-6 border-4 border-[#0c1c2e]" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 style={{ fontFamily: "Anton, sans-serif" }} className="text-2xl text-[#0c1c2e]">STAT LINE</h2>
              <button onClick={() => setShowStats(false)} className="text-[#0c1c2e] text-xl leading-none hover:text-[#c8102e]">✕</button>
            </div>
            <div className="flex justify-around mb-5">
              <StatBox label="Played" value={stats.played} />
              <StatBox label="Win %" value={winPct} />
              <StatBox label="Streak" value={stats.streak} />
              <StatBox label="Best" value={stats.maxStreak} />
            </div>
            <div className="text-[10px] uppercase tracking-widest opacity-60 mb-2">Guess Distribution</div>
            <div className="space-y-1.5 mb-4">
              {stats.dist.map((c, i) => {
                const max = Math.max(1, ...stats.dist);
                const isB = i === CONFIG.maxStrikes;
                return (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-6 text-right font-bold">{isB ? "B" : i + 1}</span>
                    <div className="flex-1 bg-[#0c1c2e]/10 rounded">
                      <div className="bg-[#c8102e] text-white text-right px-2 py-0.5 rounded font-bold" style={{ width: `${Math.max(8, (c / max) * 100)}%` }}>{c}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            {gameOver && (
              <>
                <pre className="bg-[#0c1c2e] text-white text-xs rounded p-3 whitespace-pre-wrap font-mono text-center">{buildShare()}</pre>
                <button onClick={share} className="w-full mt-3 rounded-md bg-[#c8102e] hover:bg-[#9b0c22] text-white py-2.5 font-bold tracking-widest" style={{ fontFamily: "Anton, sans-serif" }}>SHARE</button>
                {shareMsg && <div className="text-xs text-center mt-2 opacity-70">{shareMsg}</div>}
              </>
            )}
            <div className="text-center text-xs opacity-60 mt-4">Next puzzle in <span className="font-mono">{cd}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
