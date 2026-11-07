import { describe, expect, it } from 'vitest';
import { viewIcon, viewIconName } from '../look/view-icons.js';

describe('the icon a view’s name says', () => {
  it('reads the name in any of Fluvy’s languages, then the path', () => {
    const named = (title: string, path?: string) => viewIconName(title, path);
    expect(['Home', 'Luces', 'Clima', 'Energia', 'Baterias', 'Hab 1'].map((t) => named(t))).toEqual(
      ['home', 'bulb', 'thermo', 'bolt', 'battery', 'rooms'],
    );
    expect(named('Licht')).toBe('bulb');
    expect(named('Sécurité')).toBe('shield');
    expect(named('Camera da letto')).toBe('rooms');
    expect(named('Cameras')).toBe('camera');
    expect(named('Planta baja')).toBe('rooms');
    expect(named('Plantas')).toBe('leaf');
    expect(named('Automatizaciones')).toBe('automation');
    expect(named('Mutfak')).toBe('rooms');
    // what round 3 of the design review found
    expect(named('Accueil')).toBe('home');
    expect(named('Kameras')).toBe('camera');
    expect(named('Kameralar')).toBe('camera');
    expect(named('Panel principal')).toBe('home');
    expect(named('Işıklar')).toBe('bulb');
    expect(named('Oturma odası')).toBe('rooms');
    expect(named('Ana sayfa')).toBe('home');
    expect(
      ['Wohnzimmer', 'Badezimmer', 'Woonkamer', 'Slaapkamer', 'Séjour', 'Camere'].map((t) =>
        named(t),
      ),
    ).toEqual(['rooms', 'rooms', 'rooms', 'rooms', 'rooms', 'rooms']);
    expect(['Weather', 'Wetter', 'Météo', 'Weer', 'Hava durumu'].map((t) => named(t))).toEqual([
      'cloud',
      'cloud',
      'cloud',
      'cloud',
      'cloud',
    ]);
    // a bathroom is a room in every language; air and ventilation are not the weather
    expect(
      ['Baño', 'Bathroom', 'Badkamer', 'Badezimmer', 'Salle de bain', 'Bagno', 'Banyo'].map((t) =>
        named(t),
      ),
    ).toEqual(['rooms', 'rooms', 'rooms', 'rooms', 'rooms', 'rooms', 'rooms']);
    expect(['Badkamers', 'Slaapkamers'].map((t) => named(t))).toEqual(['rooms', 'rooms']);
    expect(named('Solaire')).toBe('sun');
    expect(named('Accus')).toBe('battery');
    expect(named('Havalandırma')).not.toBe('cloud');
    expect(named('Hava kalitesi')).not.toBe('cloud');
    // Japanese names, their words found anywhere (no spaces between words); the lights before the room, as in English
    expect(
      [
        '照明',
        'リビングの電気',
        '電気代',
        '空調',
        'エアコン',
        'バッテリー',
        '天気',
        '太陽光発電',
        'セキュリティ',
        '防犯カメラ',
        '寝室',
        '2階',
        '玄関の鍵',
        'メディア',
        'テレビ',
        '庭',
        'オートメーション',
        '車',
        'カレンダー',
        '家族',
        '人感センサー',
        '水道',
        '換気',
        'ブラインド',
        '掃除機',
        'ホーム',
        '家電',
        'ＬＥＤ照明',
      ].map((t) => named(t)),
    ).toEqual([
      'bulb',
      'bulb',
      'bolt',
      'thermo',
      'thermo',
      'battery',
      'cloud',
      'sun',
      'shield',
      'camera',
      'rooms',
      'rooms',
      'rooms',
      'speaker',
      'film',
      'leaf',
      'automation',
      'car',
      'calendar',
      'person',
      'chart',
      'drop',
      'fan',
      'blinds',
      'vacuum',
      'home',
      undefined,
      'bulb',
    ]);
    // Polish, its ł and its accents read plain
    const polish: ReadonlyArray<readonly [string, string]> = [
      ['Światła', 'bulb'],
      ['Ogrzewanie', 'thermo'],
      ['Pogoda', 'cloud'],
      ['Fotowoltaika', 'sun'],
      ['Bezpieczeństwo', 'shield'],
      ['Łazienka', 'rooms'],
      ['Sypialnia', 'rooms'],
      ['Kamery', 'camera'],
      ['Ogród', 'leaf'],
      ['Garaż', 'car'],
      ['Rolety', 'blinds'],
      ['Odkurzacz', 'vacuum'],
      ['Czujniki', 'chart'],
      ['Dom', 'home'],
      ['Strona główna', 'home'],
    ];
    expect(polish.map(([t]) => named(t))).toEqual(polish.map(([, icon]) => icon));
    // Simplified Chinese, its words found anywhere; a robot vacuum and a body sensor are no person, the household's
    // appliances no home
    const chinese: ReadonlyArray<readonly [string, string | undefined]> = [
      ['客厅灯光', 'bulb'],
      ['空调', 'thermo'],
      ['储能电池', 'battery'],
      ['天气', 'cloud'],
      ['光伏发电', 'sun'],
      ['能源', 'bolt'],
      ['安防', 'shield'],
      ['主卧', 'rooms'],
      ['二楼', 'rooms'],
      ['监控', 'camera'],
      ['门锁', 'lock'],
      ['音乐', 'speaker'],
      ['电视', 'film'],
      ['花园', 'leaf'],
      ['场景', 'automation'],
      ['车库', 'car'],
      ['日历', 'calendar'],
      ['家人', 'person'],
      ['人体传感器', 'chart'],
      ['浇水', 'drop'],
      ['新风', 'fan'],
      ['窗帘', 'blinds'],
      ['扫地机器人', 'vacuum'],
      ['首页', 'home'],
      ['家电', undefined],
    ];
    expect(chinese.map(([t]) => named(t))).toEqual(chinese.map(([, icon]) => icon));
    // a name it does not know reads its path
    expect(named('Mi sitio', 'fotovoltaica')).toBe('sun');
    expect(named('Xyzzy', 'qwerty')).toBeUndefined();
  });

  it('gives the icon as a mask image of the fluvy set', () => {
    expect(viewIcon('Luces')).toMatch(
      /^url\("data:image\/svg\+xml;utf8,<svg .*<path d='M[^']+'\/><\/svg>"\)$/,
    );
    expect(viewIcon('Xyzzy')).toBeUndefined();
  });
});
