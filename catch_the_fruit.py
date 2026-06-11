"""
🍎 Catch the Falling Fruit! 🍎
================================
A colorful arcade game for kids — written in pure Python (standard library only).

HOW TO PLAY
-----------
* Move your basket with the LEFT and RIGHT arrow keys.
* Catch the falling fruit to score points:
      🍎 Apple      = 1 point
      🍊 Orange     = 2 points
      🍓 Strawberry = 3 points
      ⭐ Star       = 5 points + an extra life!
* Avoid the falling 💣 BOMBS — catching one costs a life!
* You start with 3 lives. The game gets faster as your score climbs.
* Catch a fruit to keep your streak going for bonus points.

RUN IT
------
    python catch_the_fruit.py

Requires only Python 3 (the `turtle` module ships with Python — no installs).
Press the SPACE bar to start or to play again after a game over.
"""

import random
import turtle


# ---------------------------------------------------------------------------
# Game configuration
# ---------------------------------------------------------------------------
WIDTH, HEIGHT = 800, 600
GROUND_Y = -HEIGHT // 2 + 60          # height the basket sits at
BASKET_WIDTH = 90
STARTING_LIVES = 3

# Each falling object: (emoji, color, points, is_bomb, is_star)
FRUITS = [
    ("🍎", "#e74c3c", 1, False, False),
    ("🍊", "#e67e22", 2, False, False),
    ("🍓", "#ff6b81", 3, False, False),
    ("⭐", "#f1c40f", 5, False, True),
    ("💣", "#2c3e50", 0, True, False),
]
# Relative chance of each item spawning (bombs and stars are rarer).
SPAWN_WEIGHTS = [40, 25, 18, 7, 10]


class Game:
    def __init__(self):
        self.screen = turtle.Screen()
        self.screen.title("🍎 Catch the Falling Fruit! 🍎")
        self.screen.bgcolor("#aee6ff")          # cheerful sky blue
        self.screen.setup(WIDTH, HEIGHT)
        self.screen.tracer(0)                    # manual screen updates = smooth

        # The basket the player controls.
        self.basket = turtle.Turtle()
        self.basket.hideturtle()
        self.basket.penup()
        self.basket.goto(0, GROUND_Y)

        # A pen for drawing the score / lives / messages.
        self.pen = turtle.Turtle()
        self.pen.hideturtle()
        self.pen.penup()
        self.pen.color("#1b3a4b")

        # A pen that draws the falling fruit each frame.
        self.fruit_pen = turtle.Turtle()
        self.fruit_pen.hideturtle()
        self.fruit_pen.penup()

        self._bind_keys()
        self.reset()

    # -- setup helpers ------------------------------------------------------
    def _bind_keys(self):
        self.screen.listen()
        self.screen.onkeypress(self.move_left, "Left")
        self.screen.onkeypress(self.move_right, "Right")
        self.screen.onkeypress(self.handle_space, "space")

    def reset(self):
        self.basket_x = 0
        self.score = 0
        self.lives = STARTING_LIVES
        self.streak = 0
        self.fruit = None          # dict with x, y, speed, and item data
        self.running = False       # waiting on the start screen
        self.game_over = False
        self.draw_start_screen()

    # -- input handlers -----------------------------------------------------
    def move_left(self):
        if self.running:
            self.basket_x = max(-WIDTH // 2 + BASKET_WIDTH // 2, self.basket_x - 40)

    def move_right(self):
        if self.running:
            self.basket_x = min(WIDTH // 2 - BASKET_WIDTH // 2, self.basket_x + 40)

    def handle_space(self):
        if not self.running:
            if self.game_over:
                self.reset()
            self.start()

    # -- game flow ----------------------------------------------------------
    def start(self):
        self.running = True
        self.game_over = False
        self.spawn_fruit()
        self.loop()

    def spawn_fruit(self):
        emoji, color, points, is_bomb, is_star = random.choices(
            FRUITS, weights=SPAWN_WEIGHTS, k=1
        )[0]
        # Falling speed grows with the score so the game keeps getting harder.
        speed = 4 + min(self.score / 12, 9) + random.random() * 2
        self.fruit = {
            "x": random.randint(-WIDTH // 2 + 40, WIDTH // 2 - 40),
            "y": HEIGHT // 2 - 40,
            "speed": speed,
            "emoji": emoji,
            "color": color,
            "points": points,
            "is_bomb": is_bomb,
            "is_star": is_star,
        }

    def loop(self):
        if not self.running:
            return

        self.fruit["y"] -= self.fruit["speed"]

        # Did the fruit reach the basket's height?
        if self.fruit["y"] <= GROUND_Y + 25:
            caught = abs(self.fruit["x"] - self.basket_x) <= BASKET_WIDTH // 2 + 22
            self.resolve_catch(caught)
            if self.running:
                self.spawn_fruit()

        self.render()
        if self.running:
            self.screen.ontimer(self.loop, 20)   # ~50 frames per second

    def resolve_catch(self, caught):
        item = self.fruit
        if caught:
            if item["is_bomb"]:
                self.lives -= 1
                self.streak = 0
                self.flash("💥 BOOM! 💥", "#c0392b")
            else:
                self.streak += 1
                bonus = self.streak // 3        # +1 every 3-in-a-row
                self.score += item["points"] + bonus
                if item["is_star"]:
                    self.lives += 1
        else:
            # Missing a real fruit breaks the streak; missing a bomb is fine.
            if not item["is_bomb"]:
                self.streak = 0

        if self.lives <= 0:
            self.end_game()

    # -- drawing ------------------------------------------------------------
    def render(self):
        self.fruit_pen.clear()
        self.draw_basket()
        self.draw_fruit()
        self.draw_hud()
        self.screen.update()

    def draw_basket(self):
        self.basket.clear()
        self.basket.goto(self.basket_x, GROUND_Y - 18)
        self.basket.write(
            "🧺", align="center", font=("Arial", 44, "normal")
        )

    def draw_fruit(self):
        if not self.fruit:
            return
        self.fruit_pen.goto(self.fruit["x"], self.fruit["y"])
        self.fruit_pen.write(
            self.fruit["emoji"], align="center", font=("Arial", 30, "normal")
        )

    def draw_hud(self):
        self.pen.clear()
        self.pen.goto(-WIDTH // 2 + 20, HEIGHT // 2 - 40)
        self.pen.color("#1b3a4b")
        self.pen.write(
            f"Score: {self.score}", align="left", font=("Arial", 18, "bold")
        )
        self.pen.goto(WIDTH // 2 - 20, HEIGHT // 2 - 40)
        self.pen.write(
            "❤️ " * max(self.lives, 0), align="right", font=("Arial", 18, "bold")
        )
        if self.streak >= 3:
            self.pen.goto(0, HEIGHT // 2 - 40)
            self.pen.color("#e67e22")
            self.pen.write(
                f"🔥 {self.streak} streak!", align="center", font=("Arial", 16, "bold")
            )

    def flash(self, text, color):
        self.pen.goto(0, 0)
        self.pen.color(color)
        self.pen.write(text, align="center", font=("Arial", 30, "bold"))
        self.screen.update()

    def draw_start_screen(self):
        self.pen.clear()
        self.fruit_pen.clear()
        self.basket.clear()
        self.pen.color("#1b3a4b")
        self.pen.goto(0, 120)
        self.pen.write("🍎 Catch the Falling Fruit! 🍎",
                       align="center", font=("Arial", 28, "bold"))
        lines = [
            ("Use ⬅️  and  ➡️  to move your basket 🧺", 50),
            ("🍎 = 1   🍊 = 2   🍓 = 3   ⭐ = 5 + life", 10),
            ("Avoid the 💣 bombs!", -30),
            ("You have 3 lives — good luck!", -70),
        ]
        for text, y in lines:
            self.pen.goto(0, y)
            self.pen.write(text, align="center", font=("Arial", 16, "normal"))
        self.pen.color("#c0392b")
        self.pen.goto(0, -140)
        self.pen.write("Press SPACE to play!",
                       align="center", font=("Arial", 20, "bold"))
        self.screen.update()

    def end_game(self):
        self.running = False
        self.game_over = True
        self.pen.clear()
        self.fruit_pen.clear()
        self.pen.color("#c0392b")
        self.pen.goto(0, 60)
        self.pen.write("GAME OVER", align="center", font=("Arial", 40, "bold"))
        self.pen.color("#1b3a4b")
        self.pen.goto(0, 0)
        self.pen.write(f"Final score: {self.score}",
                       align="center", font=("Arial", 24, "bold"))
        self.pen.goto(0, -60)
        self.pen.write("Press SPACE to play again",
                       align="center", font=("Arial", 18, "normal"))
        self.screen.update()


def main():
    game = Game()
    turtle.done()   # hand control to turtle's event loop


if __name__ == "__main__":
    main()
