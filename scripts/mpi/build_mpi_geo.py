"""Build public/geo/mpi-regions.json: one shape per survey region in the 2026
global MPI (Table 5), for the eight ASEAN members the index covers.

Boundaries: geoBoundaries gbOpen ADM1 (Runfola et al. 2020, CC BY 4.0),
https://www.geoboundaries.org . Thailand provinces and Viet Nam provinces are
dissolved into the survey regions using the national statistics offices'
standard regional groupings. Myanmar's Nay Pyi Taw Union Territory is not a
separate shape in the source and is drawn as a point.

    python3 scripts/mpi/build_mpi_geo.py <folder with gb-ISO.geojson files>

Download each file from
https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/main/releaseData/gbOpen/<ISO>/ADM1/geoBoundaries-<ISO>-ADM1_simplified.geojson
"""
import json, sys, unicodedata
from pathlib import Path
from shapely.geometry import shape, mapping, Point
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
mpi = json.loads((ROOT / 'config/static/mpi2026.json').read_text())
want = {(g['iso'], g['name']) for g in mpi['regions']}


def norm(s):
    s = unicodedata.normalize('NFKD', s.strip()).encode('ascii', 'ignore').decode().lower()
    for w in [' province', ' special capital region', 'special region of ', ' region']:
        s = s.replace(w, '')
    return ''.join(ch for ch in s if ch.isalnum())


ALIAS = {
    'IDN': {'Bangka-Belitung Islands': 'Bangka Belitung', 'Jakarta Special Capital Region': 'Jakarta', 'North Sumatra': 'North Sumatera',
            'South Sumatra': 'South Sumatera', 'West Sumatra': 'West Sumatera', 'Special Region of Yogyakarta': 'Yogyakarta'},
    'KHM': {'Bantey Meanchey': 'Banteay Meanchay', 'Mondulkiri': 'Mondul Kiri', 'Oddar Meanchey': 'Otdar Meanchey',
            'Ratanakiri Province': 'Ratanak Kiri', 'Tbong Khmum': 'Tboung Khmum'},
    'LAO': {'Bolikhamsai': 'Borikhamxay', 'Champasak': 'Champasack', 'Houaphan': 'Huaphanh', 'Khammouane': 'Khammuan',
            'Luang Namtha': 'Luangnamtha', 'Luang Prabang': 'Luangprabang', 'Salavan': 'Saravane', 'Xaignabouli': 'Xayabury',
            'Xaisomboun': 'Xaysomboun', 'Xekong': 'Sekong', 'Xiangkhouang': 'Xiengkhuang'},
    'MMR': {'Ayeyarwady': 'Ayeyarwaddy', 'Saigang': 'Sagaing', 'Tanitharyi': 'Taninthayi'},
    'PHL': {'Bicol Region': 'Bicol', 'CAR': 'Cordillera Admin', 'Davao Region': 'Davao', 'Ilocos Region': 'Ilocos', 'NCR': 'National Capital'},
    'TLS': {'Lautém': 'Lautem', 'Liquiçá': 'Liquica', 'Oecusse': 'Oecussi'},
}

THA = {
    'North': ['Chiang Mai', 'Chiang Rai', 'Lampang', 'Lamphun', 'Mae Hong Son', 'Nan', 'Phayao', 'Phrae', 'Uttaradit', 'Tak', 'Sukhothai',
              'Phitsanulok', 'Phichit', 'Kamphaeng Phet', 'Phetchabun', 'Nakhon Sawan', 'Uthai Thani'],
    'Northeast': ['Loei', 'Nong Bua Lam Phu', 'Udon Thani', 'Nong Khai', 'Bueng Kan', 'Sakon Nakhon', 'Nakhon Phanom', 'Mukdahan', 'Kalasin',
                  'Khon Kaen', 'Chaiyaphum', 'Nakhon Ratchasima', 'Buri Ram', 'Surin', 'Si Sa Ket', 'Ubon Ratchathani', 'Yasothon',
                  'Amnat Charoen', 'Roi Et', 'Maha Sarakham'],
    'South': ['Chumphon', 'Ranong', 'Surat Thani', 'Phangnga', 'Phuket', 'Krabi', 'Nakhon Si Thammarat', 'Trang', 'Phatthalung', 'Satun',
              'Songkhla', 'Pattani', 'Yala', 'Narathiwat'],
    'Bangkok': ['Bangkok'],
}
VNM = {
    'Northern Uplands': ['Hà Giang', 'Cao Bằng', 'Bắc Kạn', 'Tuyên Quang', 'Lào Cai', 'Yên Bái', 'Thái Nguyên', 'Lạng Sơn', 'Bắc Giang',
                         'Phú Thọ', 'Điện Biên', 'Lai Châu', 'Sơn La', 'Hòa Bình'],
    'Red River Delta': ['Hà Nội', 'Vĩnh Phúc', 'Bắc Ninh', 'Quảng Ninh', 'Hải Dương', 'Hải Phòng', 'Hưng Yên', 'Thái Bình', 'Hà Nam',
                        'Nam Định', 'Ninh Bình'],
    'North Central & Central Coast': ['Thanh Hóa', 'Nghệ An', 'Hà Tĩnh', 'Quảng Bình', 'Quảng Trị', 'Thừa Thiên Huế', 'Đà Nẵng', 'Quảng Nam',
                                      'Quảng Ngãi', 'Bình Định', 'Phú Yên', 'Khánh Hòa', 'Ninh Thuận', 'Bình Thuận'],
    'Central Highlands': ['Kon Tum', 'Gia Lai', 'Đắk Lắk', 'Đắk Nông', 'Lâm Đồng'],
    'Southeast': ['Bình Phước', 'Tây Ninh', 'Bình Dương', 'Đồng Nai', 'Bà Rịa–Vũng Tàu', 'Ho Chi Minh', 'Côn Đảo'],
    'Mekong River Delta': ['Long An', 'Tiền Giang', 'Bến Tre', 'Trà Vinh', 'Vĩnh Long', 'Đồng Tháp', 'An Giang', 'Kiên Giang', 'Cần Thơ',
                           'Hậu Giang', 'Sóc Trăng', 'Bạc Liêu', 'Cà Mau'],
}


def grouping(table, default=None):
    lut = {norm(p): reg for reg, provs in table.items() for p in provs}
    def f(name):
        r = lut.get(norm(name))
        if r is None and default is None:
            raise KeyError(name)
        return r or default
    return f


def rnd(o):
    if isinstance(o, (list, tuple)):
        if o and isinstance(o[0], (int, float)):
            return [round(o[0], 2), round(o[1], 2)]
        return [rnd(x) for x in o]
    return o


def main(folder):
    groups = {}
    for iso in ['IDN', 'KHM', 'LAO', 'MMR', 'PHL', 'THA', 'VNM', 'TLS']:
        src = json.loads((Path(folder) / f'gb-{iso}.geojson').read_text())
        if iso == 'THA':
            to = grouping(THA, default='Central')
        elif iso == 'VNM':
            to = grouping(VNM)
        else:
            alias = {norm(k): v for k, v in ALIAS.get(iso, {}).items()}
            names = {norm(n): n for (i, n) in want if i == iso}
            to = lambda s, alias=alias, names=names: alias.get(norm(s)) or names[norm(s)]
        for f in src['features']:
            groups.setdefault((iso, to(f['properties']['shapeName'])), []).append(shape(f['geometry']).buffer(0))

    feats = []
    centroids = {}
    national = {}
    for (iso, name), geoms in sorted(groups.items()):
        u = unary_union(geoms)
        national.setdefault(iso, []).append(u)
        main = max(getattr(u, 'geoms', [u]), key=lambda x: x.area)
        pt = main.representative_point()
        centroids[f'{iso}|{name}'] = [round(pt.x, 2), round(pt.y, 2)]
        g = u.simplify(0.02, preserve_topology=True)
        feats.append({'type': 'Feature', 'properties': {'name': f'{iso}|{name}', 'iso': iso, 'region': name},
                      'geometry': {'type': g.geom_type, 'coordinates': rnd(mapping(g)['coordinates'])}})

    have = set(groups)
    missing = sorted(want - have)
    extra = sorted(have - want)
    assert not extra, extra
    points = {}
    for iso, name in missing:
        if (iso, name) == ('MMR', 'Naypyitaw'):
            points[f'{iso}|{name}'] = [96.13, 19.75]
        else:
            raise SystemExit(f'no shape for {iso} {name}')

    for k, xy in points.items():
        centroids[k] = xy
    for iso, gs in national.items():
        u = unary_union(gs)
        main = max(getattr(u, 'geoms', [u]), key=lambda x: x.area)
        pt = main.representative_point()
        centroids[iso] = [round(pt.x, 2), round(pt.y, 2)]
    out = {'type': 'FeatureCollection', 'features': feats,
           'points': points, 'centroids': centroids,
           'attribution': 'Boundaries: geoBoundaries gbOpen ADM1 (CC BY 4.0), Thailand and Viet Nam provinces dissolved to survey regions.'}
    path = ROOT / 'public/geo/mpi-regions.json'
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
    print(f'{len(feats)} shapes, {len(points)} points, {path.stat().st_size/1024:.0f} KB')


if __name__ == '__main__':
    main(sys.argv[1])
