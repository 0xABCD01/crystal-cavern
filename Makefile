CXX ?= c++
CPPFLAGS ?=
CXXFLAGS ?= -std=c++17 -O2 -Wall -Wextra -Wpedantic
LDFLAGS ?=
LDLIBS ?=
EMXX ?= em++
PORT ?= 8080

.PHONY: all run test test-js web serve test-web package previews clean

all: build/crystal-cavern

build:
	mkdir -p build

build/crystal-cavern: src/main.cpp include/game.hpp | build
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) src/main.cpp $(LDFLAGS) $(LDLIBS) -o $@

build/game-tests: tests/game_tests.cpp include/game.hpp | build
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) tests/game_tests.cpp $(LDFLAGS) $(LDLIBS) -o $@

run: build/crystal-cavern
	./build/crystal-cavern

test: build/game-tests
	./build/game-tests

test-js:
	node --test tests/movement_tests.mjs

web:
	$(EMXX) -std=c++17 -O2 -Wall -Wextra -Wpedantic src/web.cpp --no-entry \
		-sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createCavern \
		-sENVIRONMENT=web -sFILESYSTEM=0 -sEXPORTED_RUNTIME_METHODS=UTF8ToString \
		-o web/engine.js
	python3 scripts/package_source.py

package:
	python3 scripts/package_source.py

previews:
	python3 scripts/make_previews.py

serve: package
	python3 -m http.server $(PORT) --bind 127.0.0.1 --directory web

test-web:
	python3 tests/browser_tests.py

clean:
	rm -rf build
