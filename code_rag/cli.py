import json
import sys

from .search import search_workspace


def main(argv=None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if not args:
        return 0

    force_rebuild = False
    if args[0] == "--rebuild":
        force_rebuild = True
        if len(args) < 2:
            return 0
        folder_path = args[1]
        query = args[2] if len(args) > 2 else ""
    else:
        if len(args) < 2:
            return 0
        query = args[0]
        folder_path = args[1]

    text, timings = search_workspace(query, folder_path, force_rebuild=force_rebuild)
    if text:
        print(text)
    print(f"#timing-details: {json.dumps(_round_timings(timings))}", file=sys.stderr)
    return 0


def _round_timings(timings):
    rounded = {}
    for key, value in timings.items():
        rounded[key] = round(value, 6) if isinstance(value, float) else value
    return rounded


if __name__ == "__main__":
    raise SystemExit(main())
