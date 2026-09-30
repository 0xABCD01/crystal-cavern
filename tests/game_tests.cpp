#include "../include/game.hpp"

#include <iostream>
#include <stdexcept>
#include <string>
#include <string_view>

namespace {

constexpr std::string_view winning_route = "ddssdassssaaddwwddddddwwwwssddddww";

void check(bool condition, const char* explanation) {
    if (!condition) {
        throw std::runtime_error(explanation);
    }
}

void walk(cavern::Game& game, std::string_view commands) {
    for (char command : commands) {
        check(game.move(command), "Expected every route step to be a valid move");
    }
}

template <typename Test>
void run(const char* name, Test test, int& failures) {
    try {
        test();
        std::cout << "PASS " << name << '\n';
    } catch (const std::exception& error) {
        ++failures;
        std::cerr << "FAIL " << name << ": " << error.what() << '\n';
    }
}

} // namespace

int main() {
    int failures = 0;

    run("initial state", [] {
        const cavern::Game game;
        check(game.x() == 1 && game.y() == 1, "Unexpected player start");
        check(game.health() == 5 && game.torch() == 50, "Unexpected starting resources");
        check(game.crystals() == 0 && game.total_crystals() == 5, "Expected five crystals");
        check(game.status() == cavern::Status::playing, "Game should be running");
        check(game.score() == 0, "Unfinished runs have no score");
        for (const auto& row : game.board()) {
            check(row.size() == cavern::Game::width, "Map must be rectangular");
        }
    }, failures);

    run("walls and invalid commands preserve resources", [] {
        cavern::Game game;
        check(!game.move('w') && !game.move('a'), "Cannot move through walls");
        check(!game.move('?'), "Unknown commands must be rejected");
        check(!game.move(static_cast<char>(0xff)), "Non-ASCII input must be harmless");
        check(game.x() == 1 && game.y() == 1, "Blocked moves changed position");
        check(game.torch() == 50 && game.health() == 5, "Blocked moves cost resources");
        check(game.move('D'), "Uppercase movement should work");
        check(game.x() == 2 && game.torch() == 49, "Successful move must spend one turn");
    }, failures);

    run("crystals are collected only once", [] {
        cavern::Game game;
        walk(game, "ddssd");
        check(game.crystals() == 1, "Expected to collect the first crystal");
        check(game.board()[3][4] == '.', "Collected crystal should become floor");
        walk(game, "ad");
        check(game.crystals() == 1, "Revisiting a crystal must not collect it twice");
    }, failures);

    run("spikes remain active and health loss ends the run", [] {
        cavern::Game game;
        walk(game, "ssssddd");
        check(game.health() == 3, "Spikes must cause two damage");
        check(game.board()[5][4] == '^', "Spikes must remain on the map");
        walk(game, "ad");
        check(game.health() == 1, "Reentering spikes must cause damage again");
        walk(game, "ad");
        check(game.health() == 0, "Health must be clamped at zero");
        check(game.status() == cavern::Status::lost, "Zero health must lose");
        const int torch = game.torch();
        check(!game.move('a') && game.torch() == torch, "Loss must freeze movement");
    }, failures);

    run("potion heals at most three and can be used only once", [] {
        cavern::Game game;
        walk(game, "ssssdddad");
        check(game.health() == 1, "Expected two trap hits");
        walk(game, "dddssd");
        check(game.health() == 4, "Potion should restore three health");
        check(game.board()[7][8] == '.', "Potion should be consumed");
        walk(game, "ad");
        check(game.health() == 4, "Consumed potion must not heal again");
    }, failures);

    run("healing is capped at maximum health", [] {
        cavern::Game game;
        walk(game, "ssssddddddssd");
        check(game.health() == 5, "Potion must not exceed maximum health");
        check(game.board()[7][8] == '.', "Healing potion must be consumed");
    }, failures);

    run("potion is consumed even at full health", [] {
        cavern::Game game;
        walk(game, "ssssddssddddd");
        check(game.health() == 5, "Safe route should preserve full health");
        check(game.board()[7][8] == '.', "Full-health pickup must consume the potion");
    }, failures);

    run("exit stays locked until every crystal is collected", [] {
        cavern::Game game;
        walk(game, "ddssddwwdddddddd");
        check(game.x() == 13 && game.y() == 1, "Route must reach the exit");
        check(game.crystals() < game.total_crystals(), "Route must leave crystals behind");
        check(game.status() == cavern::Status::playing, "Incomplete collection must not win");
        check(game.torch() == 34, "Entering a locked exit must consume a turn");
    }, failures);

    run("torch exhaustion ends the run", [] {
        cavern::Game game;
        for (int i = 0; i < 25; ++i) {
            walk(game, "da");
        }
        check(game.torch() == 0 && game.health() == 5, "Expected torch-only loss");
        check(game.status() == cavern::Status::lost, "An exhausted torch must lose");
        check(game.score() == 0, "Lost runs have no score");
        check(!game.move('d') && game.torch() == 0, "Torch must not become negative");
    }, failures);

    run("complete winning route and score", [] {
        cavern::Game game;
        walk(game, winning_route);
        check(game.status() == cavern::Status::won, "All crystals plus exit must win");
        check(game.crystals() == 5 && game.torch() == 16, "Unexpected route result");
        check(game.health() == 3 && game.score() == 220, "Unexpected escape score");
        check(!game.move('s') && game.score() == 220, "Victory must freeze movement");
    }, failures);

    run("reaching the exit on the final turn wins", [] {
        cavern::Game game;
        for (int i = 0; i < 8; ++i) {
            walk(game, "da");
        }
        walk(game, winning_route);
        check(game.torch() == 0, "Route should spend the final turn");
        check(game.status() == cavern::Status::won, "Final-turn victory must beat torch loss");
        check(game.score() == 60, "Final-turn score should count remaining health");
    }, failures);

    run("restart restores all state after winning or losing", [] {
        cavern::Game game;
        walk(game, winning_route);
        game.reset();
        const cavern::Game fresh;
        check(game.board() == fresh.board(), "Reset must restore collected crystals");
        check(game.x() == 1 && game.y() == 1, "Reset must restore starting position");
        check(game.health() == 5 && game.torch() == 50, "Reset must restore resources");
        check(game.crystals() == 0 && game.total_crystals() == 5, "Reset must restore counts");
        check(game.status() == cavern::Status::playing && game.score() == 0,
              "Reset must start a fresh run");
        check(game.message() == fresh.message(), "Reset must restore the opening message");
        walk(game, "ssssddddddssd");
        for (int i = 0; i < 18; ++i) {
            walk(game, "ad");
        }
        walk(game, "a");
        check(game.status() == cavern::Status::lost, "Expected a finished loss");
        game.reset();
        check(game.board() == fresh.board(), "Reset must restore the consumed potion");
        check(game.status() == cavern::Status::playing && game.torch() == 50,
              "Reset after a loss must start a fresh run");
    }, failures);

    if (failures != 0) {
        std::cerr << failures << " test(s) failed.\n";
        return 1;
    }
    std::cout << "All 12 gameplay tests passed.\n";
    return 0;
}
