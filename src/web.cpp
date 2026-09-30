#include "../include/game.hpp"

#include <emscripten/emscripten.h>

namespace {
cavern::Game game;
}

// A small C ABI keeps both frontends on the same tested C++ rules.
extern "C" {
EMSCRIPTEN_KEEPALIVE void cavern_reset() { game.reset(); }
EMSCRIPTEN_KEEPALIVE int cavern_move(int key) {
    return game.move(static_cast<char>(key)) ? 1 : 0;
}
EMSCRIPTEN_KEEPALIVE int cavern_x() { return game.x(); }
EMSCRIPTEN_KEEPALIVE int cavern_y() { return game.y(); }
EMSCRIPTEN_KEEPALIVE int cavern_health() { return game.health(); }
EMSCRIPTEN_KEEPALIVE int cavern_torch() { return game.torch(); }
EMSCRIPTEN_KEEPALIVE int cavern_crystals() { return game.crystals(); }
EMSCRIPTEN_KEEPALIVE int cavern_total_crystals() { return game.total_crystals(); }
EMSCRIPTEN_KEEPALIVE int cavern_status() { return static_cast<int>(game.status()); }
EMSCRIPTEN_KEEPALIVE int cavern_score() { return game.score(); }
EMSCRIPTEN_KEEPALIVE int cavern_width() { return cavern::Game::width; }
EMSCRIPTEN_KEEPALIVE int cavern_height() { return cavern::Game::height; }
EMSCRIPTEN_KEEPALIVE int cavern_max_health() { return cavern::Game::max_health; }
EMSCRIPTEN_KEEPALIVE int cavern_starting_torch() { return cavern::Game::starting_torch; }
EMSCRIPTEN_KEEPALIVE int cavern_tile(int x, int y) {
    if (x < 0 || x >= cavern::Game::width || y < 0 || y >= cavern::Game::height) {
        return '#';
    }
    return game.board()[y][x];
}
EMSCRIPTEN_KEEPALIVE const char* cavern_message() { return game.message().c_str(); }
}
