from backend.app import create_app
from backend.maintenance import recompute_all_visits


def main() -> None:
    app = create_app()
    with app.app_context():
        result = recompute_all_visits()
        print("Recompute visits complete:")
        for k, v in result.items():
            print(f"  {k}: {v}")


if __name__ == "__main__":
    main()

