const puppeteer = require("puppeteer");
// const puppeteer = require('puppeteer-core'); // Use if you want to use pre-installed chrome
const creds = require("./config.json");
const { writeFile } = require("fs");

const o_debug = true;
const chapterData = {};

// https://github.com/puppeteer/puppeteer/blob/main/docs/api.md#puppeteerlaunchoptions
const puppetConfig = {
  product: "chrome",
  ignoreHTTPSErros: false,
  headless: true,
  executablePath: "", // Add user's chrome path ("/path/to/Chrome")
  slowMo: 0,
  timeout: 60000, // 60 seconds
};

const puppetConfigDebug = {
  product: "chrome",
  ignoreHTTPSErrors: false,
  headless: false,
  executablePath: "",
  slowMo: 50, // 0.05 second pause between each task
  timeout: 60000, // 60 seconds
};

async function sleep(ms) {
  log(`Sleeping for ${ms} milliseconds`);
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

async function activityAlreadyCompleted(activity) {
  const title = await activity.$eval(
    "div.activity-title",
    (node) => node.innerText
  );
  // div.check == completed (works for all colors), div.blue == completed, div.orange == completed, div.grey == not completed
  if ((await activity.$("div.title-bar-chevron-container div.check")) != null) {
    log(`\t\tSkipping already completed particatipation activity: ${title}`);
    return true;
  }
  log(`\t\tAttempting to complete particatipation activity: ${title}`);
  return false;
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
    chapterData[chapterNumber]["missed"] = [];
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
    if (activityAlreadyCompleted(animation)) return;
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
      if ((await animation.$("div.pause-button")) != null) {
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
    log("COMPLETED: animation activity");
  }
  return;
}

async function completeCustomInteractions(page) {
  const custom_activties = await page.$$(
    "div.interactive-activity-container.custom-content-resource.participation.ember-view"
  );
  for (const activity of custom_activties) {
    if (activityAlreadyCompleted(activity)) return;
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
    if (activityAlreadyCompleted(question_set)) return;
    const questions = await question_set.$$(
      "div.question-set-question.multiple-choice-question.ember-view"
    );
    for (const question of questions) {
      const choices = await question.$$("label[aria-hidden='true']");
      for (const choice of choices) {
        if (
          (await question.$("div.zb-explanation.has-explanation.correct")) !=
          null
        ) {
          return;
        }
        await choice.click({
          button: "left",
          clickCount: 1,
          delay: 0,
        });
        // Wait for the correct/incorrect box to show up
        await waitForScopedSelector("div.has-explanation", question, page);
      }
    }
    log("COMPLETED: multiple choice set");
  }
  return;
}

async function completeShortAnswer(page) {
  const short_answer_sets = await page.$$(
    "div.interactive-activity-container.short-answer-content-resource.participation.ember-view"
  );
  for (const question_set of short_answer_sets) {
    if (activityAlreadyCompleted(question_set)) return;
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
    log("COMPLETED: short answer set");
  }
  return;
}

async function completeSelectionProblems(page) {
  const selection_problem_sets = await page.$$(
    "div.interactive-activity-container.detect-answer-content-resource.participation.ember-view"
  );
  for (const question_set of selection_problem_sets) {
    if (activityAlreadyCompleted(question_set)) return;
    const questions = await question_set.$$(
      "div.question-set-question.detect-answer-question.ember-view"
    );
    for (const question of questions) {
      const choices = await question.$$("div.unclicked");
      for (const choice of choices) {
        if (
          (await question.$$("div.explanation.has-explanation.correct")) != null
        ) {
          return;
        }
        await choice.click({
          button: "left",
          clickCount: 1,
          delay: 0,
        });
      }
    }
    log("COMPLETED: selection problem set");
  }
  return;
}

async function completeProgressionChallenges(page) {
  const progression_challenges = await page.$$(
    "div.interactive-activity-container.custom-content-resource.challenge.ember-view"
  );
  for (const progression of progression_challenges) {
    if (activityAlreadyCompleted(progression)) return;
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
  log("\tRUNNING: playAnimations()");
  await playAnimations(page).catch((err) => console.error(err));
  log("\tRUNNING: completeCustomInteractions()");
  await completeCustomInteractions(page).catch((err) => console.error(err));
  log("\tRUNNING: completeMultipleChoice()");
  await completeMultipleChoice(page).catch((err) => console.error(err));
  log("\tRUNNING: completeShortAnswer()");
  await completeShortAnswer(page).catch((err) => console.error(err));
  // log("\tRUNNING: completeMatching()")
  // await completeMatching(page);
  log("\tRUNNING: completeSelectionProblems()");
  await completeSelectionProblems(page).catch((err) => console.error(err));
}

async function completeChapters(page) {
  for (const [idx, chapterNumber] of creds.chaptersToComplete.entries()) {
    console.log(`[${idx}] - ${chapterNumber}`);
  }
  for (const [idx, chapterNumber] of creds.chaptersToComplete.entries()) {
    log(`START:\t\t\tChapter ${chapterNumber}`);
    await page.goto(chapterData[chapterNumber].startUrl);
    await page.waitForSelector("div.zybook-chapter-section-page");
    await page.waitForSelector(".zybook-section.zb-card.ember-view");
    //// https://stackoverflow.com/questions/8069315/create-array-of-all-integers-between-two-numbers-inclusive-in-javascript-jquer
    for (const i of Array.from(
      { length: chapterData[chapterNumber]["sectionCount"] },
      (v, k) => k + 1
    )) {
      log(`Beginning work for: Chapter ${chapterNumber} - Section ${i}`);
      await page.waitForSelector("div.section-header-row");
      if ((await page.$("div.section-header-row h2")) != null) {
        if (
          await page.$eval("div.section-header-row h2", (node) =>
            node.innerText.includes("404")
          )
        ) {
          log(
            `Found a page error 404 for: Chapter ${chapterNumber} - Section ${i}`
          );
          log(`Skipping: Chapter ${chapterNumber} - Section ${i}`);
          return;
        }
      }
      await page.waitForSelector(".zybook-section.zb-card.ember-view");
      await page.waitForSelector("div.zybook-chapter-section-page");

      const totalParticipationActivities = (
        await page.$$("div.interactive-activity-container")
      ).length;
      const totalParticipationActivitiesAlreadyCompleted = (
        await page.$$("div.title-bar-chevron-container div.check")
      ).length;

      log(
        `There are ${totalParticipationActivities} participation activities in this section`
      );

      log(
        `Starting to complete participation activities for: Chapter ${chapterNumber} - Section ${i}`
      );
      await completeParticipationActivities(page);
      log(
        "Checking to see if the activities are done sending the completion status"
      );
      let counter = 0;
      for (const j of Array.from({ length: 30 }, (v, k) => k + 1)) {
        if (
          (await page.$("div.activity-title-bar div.zb-progress-circular")) !=
          null
        ) {
          await sleep(1000);
          counter++;
        }
      }
      if (counter > 0) {
        log(`Waited ${counter} second(s)`);
      }
      if (counter == 30) {
        log(
          `Page might have lagged when trying to submit results for: Chapter ${chapterNumber} - Section ${i}`
        );
      }

      const completedParticipationActivities = (
        await page.$$("div.title-bar-chevron-container div.check")
      ).length;
      const missedParticipationActivities = await page.$$eval(
        "div.title-bar-chevron-container div.grey",
        (divs) =>
          divs.map((id) =>
            id.parentElement.parentElement.parentElement.parentElement.getAttribute(
              "content_resource_id"
            )
          )
      );
      log(
        `For Chapter ${chapterNumber} - Section ${i}: ${completedParticipationActivities}/${totalParticipationActivities} are completed`
      );
      log(
        `Bot completed ${
          totalParticipationActivitiesAlreadyCompleted -
          completedParticipationActivities
        } activities for you`
      );

      if (missedParticipationActivities.length > 0) {
        chapterData[chapterNumber][
          "missed"
        ] = missedParticipationActivities.map(
          (miss) => `${page.url()}?content_resource_id=${miss}`
        );
        console.log(chapterData[chapterNumber]["missed"]);
        log(`Activities that require manual work have been logged`);
      }
      log(`FINISHED work for: Chapter ${chapterNumber} - Section ${i}`);

      // If on the last section for this chapter => return;
      if (i >= chapterData[chapterNumber]["sectionCount"]) {
        log(`Skipping Section ${i}`);
        return;
      }
      if ((await page.$("span.nav-test.next")) != null) {
        log(`Page has 'next section' button... clicking`);
        await page.click("span.nav-test.next");
      } else {
        log(
          `Going to the next section in Chapter ${chapterNumber} --> Section ${
            i + 1
          }`
        );
        await page.goto(
          chapterData[chapterNumber].startUrl.replace(
            /section\/\d+/,
            "section/" + (i + 1)
          )
        );
      }
    }
    console.log(
      `!!!!!!!!!!!!!! Chapter ${chapterNumber} completed !!!!!!!!!!!!!!`
    );
  }
}

async function writeMissedSections() {
  const data = {};
  [...Object.keys(chapterData)].forEach((chapter) => {
    const { misses } = chapter;
    data[`Chapter ${chapter}`] = misses;
  });
  writeFile("missedActivities.json", JSON.stringify(data), () =>
    log("Wrote 'missedActivities.json' file")
  );
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
    log("Dialog found... Accepting and moving on.");
    await dialog.accept();
  });
  try {
    await login(page).catch((err) => console.log("LOGIN ERROR: " + err));
    await selectzyBook(page).catch((err) =>
      console.log("selectzyBook ERROR: " + err)
    );
    await completeChapters(page).catch((err) => {
      console.log("completeChapters ERROR: " + err);
    });
    // await writeMissedSections();
  } catch (err) {
    console.error(err);
  }
})();
