.PHONY: dev build test release

# The dev config turns on withGlobalTauri for the MCP bridge (docs/agents/app-testing.md).
dev:
	npm run app:dev

build:
	npm run tauri build

test:
	npm test

# make release VERSION=0.2.0: bump the version, commit and tag. Pushing the
# tag starts the release workflow, which builds a draft GitHub release.
release:
	@test -n "$(VERSION)" || { echo "usage: make release VERSION=x.y.z"; exit 1; }
	@test -z "$$(git status --porcelain)" || { echo "Commit or stash your changes first."; exit 1; }
	node scripts/version.mjs set $(VERSION)
	npm test
	git diff --quiet || git commit -am "Release v$(VERSION)"
	git tag -a v$(VERSION) -m "Awen $(VERSION)"
	@echo "Tagged v$(VERSION). Start the build with: git push origin HEAD v$(VERSION)"
