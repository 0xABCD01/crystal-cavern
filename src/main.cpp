#include "../include/game.hpp"

#include <iostream>
#include <sstream>
#include <string>
#include <string_view>

namespace {

void print_help() {
    std::cout
        << "\nCRYSTAL CAVERN\n"
        << "Collect all 5 crystals (*) and reach the exit (E).\n"
        << "You have 5 health and 50 torch turns. Every successful move uses a turn.\n"
        << "Spikes (^) cost 2 health each time you enter them.\n"
        << "A potion (+) heals up to 3 health and is consumed even at full health.\n"
        << "Walls and invalid commands cost no turns.\n\n"
        << "Type one command, then press Enter:\n"
        << "  W/A/S/D  Move up/left/down/right\n"
        << "  H        Show help\n"
        << "  R        Restart\n"
        << "  Q        Quit\n\n"
        << "Escape score: 10 per remaining torch turn + 20 per remaining health.\n";
}

void render(const cavern::Game& game) {
    std::cout << "\n  Health: " << game.health() << '/' << cavern::Game::max_health
              << "   Torch: " << game.torch()
              << "   Crystals: " << game.crystals() << '/' << game.total_crystals()
              << "\n\n";

    for (int y = 0; y < cavern::Game::height; ++y) {
        std::cout << "  ";
        for (int x = 0; x < cavern::Game::width; ++x) {
            std::cout << (x == game.x() && y == game.y() ? '@' : game.board()[y][x]);
        }
        std::cout << '\n';
    }

    std::cout << "\n  @ You   # Wall   * Crystal   ^ Spikes   + Potion   E Exit\n"
              << "\n  " << game.message() << '\n';

    if (game.status() == cavern::Status::won) {
        std::cout << "  VICTORY! Score: " << game.score() << '\n';
    } else if (game.status() == cavern::Status::lost) {
        std::cout << "  GAME OVER\n";
    }
}

} // namespace

int main(int argc, char* argv[]) {
    if (argc == 2 && std::string_view(argv[1]) == "--help") {
        print_help();
        return 0;
    }
    if (argc != 1) {
        std::cerr << "Usage: crystal-cavern [--help]\n";
        return 2;
    }

    cavern::Game game;
    print_help();
    render(game);

    for (std::string line;;) {
        std::cout << (game.status() == cavern::Status::playing
            ? "\nW/A/S/D | H help | R restart | Q quit > "
            : "\nR replay | Q quit > ") << std::flush;

        if (!std::getline(std::cin, line)) {
            std::cout << "\nThanks for playing!\n";
            return 0;
        }

        std::istringstream input(line);
        std::string token;
        std::string extra;
        if (!(input >> token) || token.size() != 1 || (input >> extra)) {
            std::cout << "Enter exactly one command letter, then press Enter.\n";
            continue;
        }

        const char command = static_cast<char>(
            std::tolower(static_cast<unsigned char>(token[0])));
        if (command == 'q') {
            std::cout << "Thanks for playing!\n";
            return 0;
        }
        if (command == 'h') {
            print_help();
            continue;
        }
        if (command == 'r') {
            game.reset();
        } else if (game.status() != cavern::Status::playing) {
            std::cout << "This run has ended. Use R to replay or Q to quit.\n";
            continue;
        } else {
            game.move(command);
        }
        render(game);
    }
}
