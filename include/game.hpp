#pragma once

#include <algorithm>
#include <array>
#include <cctype>
#include <string>
#include <string_view>

namespace cavern {

enum class Status { playing, won, lost };

class Game {
public:
    static constexpr int width = 15;
    static constexpr int height = 9;
    static constexpr int max_health = 5;
    static constexpr int starting_torch = 50;

    Game() { reset(); }

    void reset() {
        health_ = max_health;
        torch_ = starting_torch;
        crystals_ = 0;
        total_crystals_ = 0;
        status_ = Status::playing;
        message_ = "Find every crystal, then reach E. Your torch lasts 50 moves.";

        for (int y = 0; y < height; ++y) {
            board_[y] = layout_[y];
            for (int x = 0; x < width; ++x) {
                if (board_[y][x] == '@') {
                    x_ = x;
                    y_ = y;
                    board_[y][x] = '.';
                } else if (board_[y][x] == '*') {
                    ++total_crystals_;
                }
            }
        }
    }

    // Returns true only when the player moved and spent one torch turn.
    bool move(char command) {
        if (status_ != Status::playing) {
            return false;
        }

        const char key = static_cast<char>(
            std::tolower(static_cast<unsigned char>(command)));
        int dx = 0;
        int dy = 0;
        switch (key) {
        case 'w': dy = -1; break;
        case 'a': dx = -1; break;
        case 's': dy = 1; break;
        case 'd': dx = 1; break;
        default:
            message_ = "Use W, A, S, or D to move.";
            return false;
        }

        const int next_x = x_ + dx;
        const int next_y = y_ + dy;
        if (next_x < 0 || next_x >= width || next_y < 0 || next_y >= height ||
            board_[next_y][next_x] == '#') {
            message_ = "A wall blocks your path. Your torch loses no time.";
            return false;
        }

        x_ = next_x;
        y_ = next_y;
        --torch_;
        char& tile = board_[y_][x_];
        message_ = "You step deeper into the cavern.";

        switch (tile) {
        case '*':
            ++crystals_;
            tile = '.';
            message_ = crystals_ == total_crystals_
                ? "All crystals collected! Head for E."
                : "You collected a crystal.";
            break;
        case '^':
            health_ = std::max(0, health_ - 2);
            message_ = "Spikes! You lose 2 health. The trap remains active.";
            break;
        case '+': {
            const int restored = std::min(3, max_health - health_);
            health_ += restored;
            tile = '.';
            message_ = "You drink the potion and restore " +
                std::to_string(restored) + " health.";
            break;
        }
        case 'E':
            if (crystals_ != total_crystals_) {
                message_ = "The exit is sealed. Collect all crystals first.";
            }
            break;
        default:
            break;
        }

        // Escaping on the final torch turn counts as a win.
        if (health_ == 0) {
            status_ = Status::lost;
            message_ = "Your health reaches zero. The cavern claims another explorer.";
        } else if (tile == 'E' && crystals_ == total_crystals_) {
            status_ = Status::won;
            message_ = "You escape with every crystal!";
        } else if (torch_ == 0) {
            status_ = Status::lost;
            message_ = "Your torch burns out. You are lost in the darkness.";
        }
        return true;
    }

    [[nodiscard]] int x() const { return x_; }
    [[nodiscard]] int y() const { return y_; }
    [[nodiscard]] int health() const { return health_; }
    [[nodiscard]] int torch() const { return torch_; }
    [[nodiscard]] int crystals() const { return crystals_; }
    [[nodiscard]] int total_crystals() const { return total_crystals_; }
    [[nodiscard]] Status status() const { return status_; }
    [[nodiscard]] const std::string& message() const { return message_; }
    [[nodiscard]] const std::array<std::string, height>& board() const {
        return board_;
    }
    [[nodiscard]] int score() const {
        return status_ == Status::won ? torch_ * 10 + health_ * 20 : 0;
    }

private:
    inline static constexpr std::array<std::string_view, height> layout_{{
        "###############",
        "#@..#....*...E#",
        "#.#.#.###.###.#",
        "#.#.*...#...*.#",
        "#.#.###.#.#.#.#",
        "#...^...*.#...#",
        "###.###.#.###.#",
        "#*......+..^..#",
        "###############",
    }};

    std::array<std::string, height> board_{};
    int x_ = 1;
    int y_ = 1;
    int health_ = max_health;
    int torch_ = starting_torch;
    int crystals_ = 0;
    int total_crystals_ = 0;
    Status status_ = Status::playing;
    std::string message_;
};

} // namespace cavern
