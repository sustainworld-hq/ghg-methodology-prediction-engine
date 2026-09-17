"""Local runner for the factor resolver.

Standard library only — no Flask, no model client, no network calls. It loads
one frozen release and one binding file at startup and answers from them, so
it has the same shape as the methodology service: read-only, deterministic,
nothing to reach out to.

  python factors/server.py            -> http://127.0.0.1:5200
"""

from __future__ import annotations

import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from resolver import default  # noqa: E402

R = default()
PAGE = HERE / "public" / "index.html"

# Clickable cases, one per behaviour the tests pin. Each is a real query
# against real rows in the frozen release.
SCENARIOS = [
    {"label": "Diesel car, CO2e per km", "expect": "DERIVATION_REQUIRED",
     "why": "the publisher ships CH4 and N2O per km, not CO2",
     "methodology": "DIST_BASED",
     "record": {"activityCategory": "mobileCombustion", "mode": "Road — Car (Diesel)"},
     "want_gas": "CO2E", "want_unit": "km", "reporting_year": 2026},
    {"label": "Jet kerosene, CO2 per TJ", "expect": "FACTOR_SELECTED",
     "why": "a single published scalar",
     "methodology": "FUEL_BASED",
     "record": {"activityCategory": "stationaryCombustion", "fuelType": "Jet Kerosene (Jet A-1)"},
     "want_gas": "CO2", "want_unit": "TJ"},
    {"label": "Diesel, CO2 per litre", "expect": "FACTOR_SELECTED",
     "why": "reached through the density row the workbook publishes",
     "methodology": "FUEL_BASED",
     "record": {"activityCategory": "stationaryCombustion", "fuelType": "Diesel"},
     "want_gas": "CO2", "want_unit": "litre"},
    {"label": "Diesel car, CH4 per mile", "expect": "MULTIPLE_FACTORS_APPLICABLE",
     "why": "published per vehicle year; the activity names none",
     "methodology": "DIST_BASED",
     "record": {"activityCategory": "mobileCombustion", "mode": "Road — Car (Diesel)"},
     "want_gas": "CH4", "want_unit": "mile"},
    {"label": "Light goods vehicle, CH4 per km", "expect": "MULTIPLE_FACTORS_APPLICABLE",
     "why": "BROADER binding; includes a published range",
     "methodology": "DIST_BASED",
     "record": {"activityCategory": "mobileCombustion", "mode": "Road — LGV (<3.5t)"},
     "want_gas": "CH4", "want_unit": "km"},
    {"label": "Bituminous coal, CO2 per TJ", "expect": "FACTOR_SELECTED",
     "why": "selected, but the binding is BROADER and says so",
     "methodology": "FUEL_BASED",
     "record": {"activityCategory": "stationaryCombustion", "fuelType": "Coal — Bituminous"},
     "want_gas": "CO2", "want_unit": "TJ"},
    {"label": "Short-haul flight", "expect": "NO_BINDING",
     "why": "this workbook has no aviation factors, and it will not widen to road",
     "methodology": "DIST_BASED",
     "record": {"activityCategory": "businessTravel", "mode": "Air — Short Haul (<1,600 km)"},
     "want_gas": "CO2E", "want_unit": "km"},
]


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body, ctype="application/json; charset=utf-8"):
        data = body if isinstance(body, bytes) else json.dumps(body, indent=2,
                                                               ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):  # quiet
        pass

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            return self._send(200, PAGE.read_bytes(), "text/html; charset=utf-8")
        if self.path == "/api/release":
            rel = R.release
            return self._send(200, {
                "release_id": rel["release_id"], "publisher": rel["publisher"],
                "dataset_version": rel["dataset_version"],
                "source_file": rel["source_file"],
                "release_digest": rel.get("release_digest"),
                "factors": len(rel["factors"]), "conversions": len(rel["conversions"]),
                "ranges": sum(1 for f in rel["factors"] if f["value_kind"] == "RANGE"),
                "rejected": len(rel["rejected"]),
                "binding_policy_version": R.bindings["binding_policy_version"],
                "bindings": len(R.bindings["bindings"]),
                "model_in_path": False,
            })
        if self.path == "/api/scenarios":
            return self._send(200, SCENARIOS)
        if self.path == "/api/bindings":
            return self._send(200, R.bindings["bindings"])
        return self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/api/resolve":
            return self._send(404, {"error": "not found"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(n) or b"{}")
            res = R.resolve(body["methodology"], body.get("record") or {},
                            want_gas=body.get("want_gas", "CO2E"),
                            want_unit=body.get("want_unit") or None,
                            reporting_year=body.get("reporting_year"))
            return self._send(200, res)
        except KeyError as e:
            return self._send(400, {"error": f"missing field {e}"})
        except Exception as e:  # noqa: BLE001
            return self._send(500, {"error": f"{type(e).__name__}: {e}"})


def main() -> int:
    port = int(sys.argv[sys.argv.index("--port") + 1]) if "--port" in sys.argv else 5200
    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    rel = R.release
    print(f"factor resolver — release {rel['release_id']}")
    print(f"  {len(rel['factors'])} factors, {len(rel['conversions'])} conversions, "
          f"{len(R.bindings['bindings'])} bindings")
    print(f"  digest {str(rel.get('release_digest'))[:16]}…")
    print("  no model, no network — standard library only")
    print(f"  http://127.0.0.1:{srv.server_address[1]}")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
