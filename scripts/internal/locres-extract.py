import struct, json, sys

MAGIC = bytes([0x0E,0x14,0x74,0x75,0x67,0x4A,0x03,0xFC,0x4A,0x15,0x90,0x9D,0xC3,0x37,0x7F,0x1B])

def read_fstring(buf, off):
    (ln,) = struct.unpack_from("<i", buf, off); off += 4
    if ln == 0: return "", off
    if ln > 0:
        s = buf[off:off+ln-1].decode("utf-8", errors="replace"); off += ln
    else:
        n = -ln
        s = buf[off:off+(n-1)*2].decode("utf-16-le", errors="replace"); off += n*2
    return s, off

def parse_locres(path):
    buf = open(path, "rb").read()
    off = 0
    version = 0
    if buf[:16] == MAGIC:
        off = 16
        version = buf[off]; off += 1
    strings = []
    if version >= 1:
        (str_off,) = struct.unpack_from("<q", buf, off); off += 8
        if version >= 3:
            (entries_count,) = struct.unpack_from("<I", buf, off); off += 4
        # read localized string array
        soff = str_off
        (count,) = struct.unpack_from("<I", buf, soff); soff += 4
        for _ in range(count):
            s, soff = read_fstring(buf, soff)
            if version >= 3:
                soff += 4  # refcount
            strings.append(s)
    (ns_count,) = struct.unpack_from("<I", buf, off); off += 4
    result = {}
    for _ in range(ns_count):
        if version >= 2: off += 4  # namespace hash
        ns, off = read_fstring(buf, off)
        (key_count,) = struct.unpack_from("<I", buf, off); off += 4
        for _ in range(key_count):
            if version >= 2: off += 4  # key hash
            key, off = read_fstring(buf, off)
            off += 4  # source string hash
            if version >= 1:
                (idx,) = struct.unpack_from("<i", buf, off); off += 4
                val = strings[idx] if 0 <= idx < len(strings) else ""
            else:
                val, off = read_fstring(buf, off)
            result[f"{ns}::{key}" if ns else key] = val
    return result

if __name__ == "__main__":
    path, pattern, out = sys.argv[1], sys.argv[2], sys.argv[3]
    table = parse_locres(path)
    hits = {k: v for k, v in table.items() if pattern in k}
    json.dump({"total": len(table), "hits": hits}, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("total keys:", len(table), "| matches:", len(hits))
