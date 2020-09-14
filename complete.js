const puppeteer = require("puppeteer");
const creds = require("./config.json");

const o_debug = true;
const chapterData = {};

// https://github.com/puppeteer/puppeteer/blob/main/docs/api.md#puppeteerlaunchoptions
const puppetConfig = {
  product: "chrome",
  ignoreHTTPSErros: false,
  headless: true,
  executablePath: "",
  slowMo: 0,
  timeout: 30000,
};

const puppetConfigDebug = {
  product: "chrome",
  ignoreHTTPSErrors: false,
  headless: false,
  executablePath: "",
  slowMo: 50,
  timeout: 30000,
};

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const log = (string) => {
  if (!string || !o_debug) return;
  // Im tired and this is all i want right now for this to work
  let now = new Date();
  let time = now.toString().match(/(.+?)\sGMT/i)[1];
  console.log(`[${time}] - ${string}`);
};

async function waitForScopedSelector(selector, scopeElement, page) {
  return await page.waitForFunction(
    (selector, scopeElement) => scopeElement.querySelector(selector),
    {},
    selector,
    scopeElement
  );
}

async function findAndClickScopedSelector(selector, scopeElement, page) {
  return await page.evaluate(
    (selector, scopeElement) => scopeElement.querySelector(selector).click(),
    {},
    selector,
    scopeElement
  );
}

async function findAndClick() {

}

async function login(page) {
  log("Going to zyBooks login page.");
  await page.goto("https://learn.zybooks.com/signin");
  log("Typing in credentials.");
  await page.type("input[type='email']", creds.email);
  await page.type("input[type='password']", creds.pass);
  await page.click(".signin-button", {
    button: "left",
    clickCount: 1,
    delay: 0,
  });
  await page.waitForSelector("div.zybooks-container");
  return page;
}

async function selectzyBook(page) {
  log("Navigating to course page (using the predefined course code)");
  await page.goto("https://learn.zybooks.com/zybook/" + creds.zybook);
  await page.waitForSelector("div.zybook-index-page");
  const chapters = await page.$$(".chapter-item");
  log(`There are ${chapters.length} chapters to choose from!`);
  await page.evaluate(() => {
    document.querySelectorAll(".chapter-item h3").forEach((e) => {
      e.click();
    });
  });
  for (const [idx, e] of chapters.entries()) {
    const sectionCount = (await e.$$("li")).length;
    let chapterNumber = `${idx + 1}`;
    chapterData[chapterNumber] = {};
    chapterData[chapterNumber]["sectionCount"] = await sectionCount;
    chapterData[chapterNumber][
      "startUrl"
    ] = `https://learn.zybooks.com/zybook/WISCCOMPSCI240MATH240HastiFall2020/chapter/${chapterNumber}/section/1`;
  }
  return page;
}

async function playAnimations(page) {
  const animation_players = await page.$$(
    "div.interactive-activity-container.animation-player-content-resource.participation.ember-view"
  );
  for (const animation of animation_players) {
    const double_speed = await animation.$("div.speed-control");
    await double_speed.click({
      button: "left",
      clickCount: 1,
      delay: 0,
    });
    const start_button = await animation.$(
      "button.start-button.start-graphic.zb-button.primary.raised.ember-view"
    );
    await start_button.click({
      button: "left",
      clickCount: 1,
      delay: 0,
    });
    while ((await animation.$$("div.play-button.rotate-180")).length == 0) {
      // Wait for it to finish
      if (await animation.$("div.pause-button") != null) {
        continue;
      }
      const play_button = await animation.$("div.play-button.bounce");
      if (await play_button) {
        await play_button.click({
          button: "left",
          clickCount: 1,
          delay: 0,
        });
      }
    }
    log("Completed animation activity");
  }
  return;
}

async function completeCustomInteractions(page) {
  const custom_activties = await page.$$(
    "div.interactive-activity-container.custom-content-resource.participation.ember-view"
  );
  for (const activity of custom_activties) {
    const buttons = await activity.$$("button.button");
    for (const button of buttons) {
      await button.click({
        button: "left",
        clickCount: 1,
        delay: 0,
      });
    }
  }
  return;
}

async function completeMultipleChoice(page) {
  const multiple_choice_sets = await page.$$(
    "div.interactive-activity-container.multiple-choice-content-resource.participation.ember-view"
  );
  for (const question_set of multiple_choice_sets) {
    const questions = await question_set.$$(
      "div.question-set-question.multiple-choice-question.ember-view"
    );
    for (const question of questions) {
      const choices = await question.$$("label[aria-hidden='true']");
      for (const choice of choices) {
        if (await question.$("div.zb-explanation.has-explanation.correct") != null) {
          return;
        }
        await choice.click({
          button: "left",
          clickCount: 1,
          delay: 0,
        });
      }
    }
    log("Completed multiple choice set");
  }
  return;
}

async function completeShortAnswer(page) {
  const short_answer_sets = await page.$$(
    "div.interactive-activity-container.short-answer-content-resource.participation.ember-view"
  );
  for (const question_set of short_answer_sets) {
    const questions = await question_set.$$(
      "div.question-set-question.short-answer-question.ember-view"
    );
    for (const question of questions) {
      const show_answer_button = await question.$(
        "button.show-answer-button.zb-button.secondary.ember-view"
      );
      await show_answer_button.click({
        button: "left",
        clickCount: 1,
        delay: 0,
      });
      await show_answer_button.click({
        button: "left",
        clickCount: 1,
        delay: 0,
      });
      await waitForScopedSelector("span.forfeit-answer", question, page);
      const answer = await question.$eval(
        "span.forfeit-answer",
        (answer) => answer.innerText
      );
      //`${await question.$("span.forfeit-answer").innerText}`;
      const text_area = await question.$(
        "textarea.zb-text-area.hide-scrollbar.ember-text-area.ember-view"
      );
      await text_area.type(answer, { delay: 25 });
      const check_button = await question.$(
        "button.check-button.zb-button.primary.raised.ember-view"
      );
      await check_button.click({
        button: "left",
        clickCount: 1,
        delay: 0,
      });
    }
    log("Complete short answer set");
  }
  return;
}

async function completeSelectionProblems(page) {
  const selection_problem_sets = await page.$$(
    "div.interactive-activity-container.detect-answer-content-resource.participation.ember-view"
  );
  for (const question_set of selection_problem_sets) {
    const questions = await question_set.$$(
      "div.question-set-question.detect-answer-question.ember-view"
    );
    for (const question of questions) {
      const choices = await question.$$("div.unclicked");
      for (const choice of choices) {
        if (await question.$$("div.explanation.has-explanation.correct") != null) {
          return;
        }
        await choice.click({
          button: "left",
          clickCount: 1,
          delay: 0,
        });
      }
    }
  }
  log("Completed selection problem set");
  return;
}

async function completeProgressionChallenges(page) {
  const progression_challenges = await page.$$(
    "div.interactive-activity-container.custom-content-resource.challenge.ember-view"
  );
  for (const progression of progression_challenges) {
    let progression_status = await progression.$$(
      "div.zyante-progression-status-bar > div"
    );
    for (const status of progression_status) {
      // if (await status.innerText.includes("1")) {
      if (await status.evaluate((node) => node.innerText.includes("1"))) {
        // start_button = progression.$("button.zyante-progression-start-button.button")
        await page.click("button.zyante-progression-start-button.button", {
          button: "left",
          clickCount: 1,
          delay: 0,
        });
      } else {
        // next_button = progression.$(".zyante-progression-next-button.button");
        await page.click(".zyante-progression-next-button.button", {
          button: "left",
          clickCount: 1,
          delay: 0,
        });
      }
    }
  }
  return;
}

async function completeParticipationActivities(page) {
  log("Running playAnimations");
  await playAnimations(page).catch((err) => console.error("\t\t\t" + err));
  log("Running completeCustomInteractions");
  await completeCustomInteractions(page);
  log("Running completeMultipleChoice");
  await completeMultipleChoice(page);
  log("Running completeShortAnswer");
  await completeShortAnswer(page);
  // log("Running completeMatching")
  // await completeMatching(page);
  log("Running completeSelectionProblems");
  await completeSelectionProblems(page);
}

async function completeChapters(page) {
  // creds.chaptersToComplete.forEach(async (chapterNumber) => {
  for (const [idx, chapterNumber] of creds.chaptersToComplete.entries()) {
    await page.goto(chapterData[chapterNumber].startUrl);
    await page.waitForSelector("div.zybook-chapter-section-page");
    await page.waitForSelector(".zybook-section.zb-card.ember-view");
    // for (let i = 1; i < chapterData[chapterNumber]["sectionCount"]; i++) {
    // for await (const sectionCount of chapterData[chapterNumber][
    //   "sectionCount"
    // ]) {
    // for (let i = 1; i < chapterData[chapterNumber]["sectionCount"]; i++) {
    //// https://stackoverflow.com/questions/8069315/create-array-of-all-integers-between-two-numbers-inclusive-in-javascript-jquer
    for (const i of Array.from(
      { length: chapterData[chapterNumber]["sectionCount"] - 1 },
      (v, k) => k + 1
    )) {
      // await (async () => {
      await completeParticipationActivities(page);
      // TODO: Add a check to see when the loading is done on activity completion
      log("Sleeping for 5 seconds to let the page finish doing its thang!");
      await sleep(5000);
      if ((await page.$("span.nav-test.next")) != null) {
        await page.click("span.nav-test.next");
      } else {
        await page.goto(
          chapterData[chapterNumber].startUrl.replace(
            /section\/\d+/,
            "section/" + (i + 1)
          )
        );
      }
      await page.waitForSelector(".zybook-section.zb-card.ember-view");
      await page.waitForSelector("div.zybook-chapter-section-page");
      // })();
    }
  }
  return;
}


// Main Function
(async () => {
  const browser = await puppeteer.launch(puppetConfigDebug);
  const page = await browser.newPage();
  await page.setViewport({
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
  });
  page.on("dialog", async (dialog) => {
    log("dialog found");
    await dialog.accept();
  });
  try {
    await login(page).catch((err) => console.log("ERROR!!11!111!! " + err));
    await selectzyBook(page).catch((err) => console.log("ERROR!!!!! " + err));
    await completeChapters(page).catch((err) => {
      console.log("ERROR!!!!!22222 " + err);
    });
  } catch (err) {
    console.error(err);
  }
})();
