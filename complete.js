const puppeteer = require("puppeteer");
//const puppeteer = require('puppeteer-core'); // Use if you want to use pre-installed chrome
const creds = require("./config.json");
const { writeFile } = require("fs");

//fixed bugs
// https://github.com/puppeteer/puppeteer/blob/main/docs/api.md#puppeteerlaunchoptions
const puppetConfig = {
  product: "chrome",
  ignoreHTTPSErros: false,
  headless: true,
  executablePath: "/Applications/Google Chrome.app", // Add user's chrome path ("/path/to/Chrome")
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

const o_debug = true;
const chapterData = {};
const selected_config = puppetConfigDebug;

async function sleep(ms) {
  log(`Sleeping for ${ms} milliseconds`);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const log = (str) => {
  if (!str) return;
  let now = new Date();
  let time = now.toLocaleString();
  console.log(`[${time}] - ${str}`);
};

const logDebug = (str) => {
  if (!str || !o_debug) return;
  let now = new Date();
  let time = now.toLocaleString();
  console.log(`[${time}][DEBUG] - ${str}`);
};

const _click = async (element) => {
  element?.click();
};

/**
 *
 * @param {String} selector
 * @param {*} scopeElement
 * @param {*} page
 * @returns
 */
async function waitForScopedSelector(selector, scopeElement, page) {
  return await page.waitForFunction(
    (selector, scopeElement) => scopeElement.querySelector(selector),
    {},
    selector,
    scopeElement
  );
}

async function activityAlreadyCompleted(activity) {
  if (o_debug == true) {
    // allow us to still simulate the activity for testing
    // return false;
  }
  const title = await activity.$eval(
    "div.activity-title",
    (node) => node.innerText
  );

  // div.check == completed (works for all colors)
  // div.blue == completed
  // div.orange == completed
  // div.grey == not completed
  if (
    (await activity.$("div.title-bar-chevron-container div.check")) != null ||
    (await activity.$("[aria-label='Activity completed']")) != null
  ) {
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
  const signInButton = await page.$(".signin-button");
  await page.evaluate(_click, signInButton);
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
    document.querySelectorAll(".chapter-title").forEach((e) => {
      e.click();
    });
  });
  await sleep(3000);
  chapterData["baseUrl"] = await page.evaluate(() => document.location.href);
  for (const [idx, chapterItem] of chapters.entries()) {
    const sectionCount = (await chapterItem.$$("li")).length;
    let chapterNumber = `${idx + 1}`;
    chapterData[chapterNumber] = {};
    chapterData[chapterNumber]["missed"] = [];
    chapterData[chapterNumber]["sectionCount"] = await sectionCount;
    chapterData[chapterNumber][
      "startUrl"
    ] = `${chapterData["baseUrl"]}/chapter/${chapterNumber}/section/1`;
  }
  return page;
}

async function playAnimations(page) {
  const animationPlayers = await page.$$(
    "div.interactive-activity-container.animation-player-content-resource.participation"
  );
  if (animationPlayers.length == 0) {
    log(`\t\tNo playAnimations to do...`);
    return Promise.resolve();
  }
  for (const animation of animationPlayers) {
    if (await activityAlreadyCompleted(animation) === true) {
      continue;
    }
    // 2x Speed Input
    const doubleSpeedButton = await animation.$("div.speed-control input");
    await page.evaluate(_click, doubleSpeedButton);

    // Start animation button
    const startAnimationButton = await animation.$("span.title");
    await page.evaluate(_click, startAnimationButton);

    while ((await animation.$$("div.play-button.rotate-180")).length == 0) {
      // Wait for it to finish
      if ((await animation.$("div.pause-button")) != null) {
        continue;
      }
      const play_button = await animation.$("div.play-button.bounce");
      if (await play_button) {
        await page.evaluate(_click, play_button);
      }
    }
    log("COMPLETED: animation activity");
  }
  return Promise.resolve();
}

async function completeCustomInteractions(page) {
  const custom_activties = await page.$$(
    "div.interactive-activity-container.custom-content-resource.participation"
  );
  if (custom_activties.length == 0) {
    log(`\t\tNo completeCustomInteractions to do...`);
    return Promise.resolve();
  }
  for (const activity of custom_activties) {
    if (await activityAlreadyCompleted(activity) === true) {
      continue;
    }
    const buttons = await activity.$$("button.button");
    for (const button of buttons) {
      await page.evaluate(_click, button);
    }
  }
}

async function completeMultipleChoice(page) {
  const multipleChoiceSets = await page.$$(
    "div.interactive-activity-container.multiple-choice-content-resource.participation"
  );
  if (multipleChoiceSets.length == 0) {
    log(`\t\tNo completeMultipleChoice to do...`);
    return Promise.resolve();
  }
  for (const choiceSet of multipleChoiceSets) {
    if (await activityAlreadyCompleted(choiceSet) === true) {
      continue;
    }
    const questions = await choiceSet.$$(
      "div.question-set-question.multiple-choice-question"
    );
    for (const question of questions) {
      const choices = await question.$$("label[aria-hidden='true']");
      for (const choice of choices) {
        if (
          (await question.$("div.zb-explanation.has-explanation.correct")) !=
          null
        ) {
          break;
        }
        await page.evaluate(_click, choice);
        // Wait for the correct/incorrect box to show up
        await waitForScopedSelector("div.has-explanation", question, page);
      }
    }
    log("COMPLETED: multiple choice set");
  }
  return Promise.resolve();
}

async function completeShortAnswer(page) {
  const shortAnswerSets = await page.$$(
    "div.interactive-activity-container.short-answer-content-resource.participation"
  );
  if (shortAnswerSets.length == 0) {
    log(`\t\tNo completeShortAnswer to do...`);
    return Promise.resolve();
  }
  for (const questionSet of shortAnswerSets) {
    if (await activityAlreadyCompleted(questionSet) === true) {
      continue;
    }
    const questions = await questionSet.$$(
      "div.question-set-question.short-answer-question"
    );
    for (const question of questions) {
      const show_answer_button = await question.$(
        "button.show-answer-button.zb-button.secondary"
      );
      await page.evaluate(_click, show_answer_button);
      await page.evaluate(_click, show_answer_button);
      await waitForScopedSelector("span.forfeit-answer", question, page);
      const answer = await question.$eval(
        "span.forfeit-answer",
        (answer) => answer.innerText
      );
      const text_area = await question.$(
        "textarea.zb-text-area.hide-scrollbar.ember-text-area"
      );
      await text_area.type(answer, { delay: 25 });
      const check_button = await question.$(
        "button.check-button.zb-button.primary.raised"
      );
      await page.evaluate(_click, check_button);
    }
    log("COMPLETED: short answer set");
  }
  return Promise.resolve();
}

async function completeSelectionProblems(page) {
  const selection_problem_sets = await page.$$(
    "div.interactive-activity-container.detect-answer-content-resource.participation"
  );
  if (selection_problem_sets.length == 0) {
    log(`\t\tNo completeSelectionProblems to do...`);
    return Promise.resolve();
  }
  for (const question_set of selection_problem_sets) {
    if (await activityAlreadyCompleted(question_set) === true) {
      continue;
    }
    const questions = await question_set.$$(
      "div.question-set-question.detect-answer-question"
    );
    for (const question of questions) {
      const choices = await question.$$("div.unclicked");
      for (const choice of choices) {
        if (
          (await question.$$("div.explanation.has-explanation.correct")) != null
        ) {
          break;
        }
        await page.evaluate(_click, choice);
      }
    }
    log("COMPLETED: selection problem set");
  }
  return Promise.resolve();
}

async function completeProgressionChallenges(page) {
  const progression_challenges = await page.$$(
    "div.interactive-activity-container.custom-content-resource.challenge"
  );
  if (progression_challenges.length == 0) {
    log(`\t\tNo completeProgressionChallenges to do...`);
    return Promise.resolve();
  }
  for (const progression of progression_challenges) {
    if (await activityAlreadyCompleted(progression) === true) {
      continue;
    }
    let progression_status = await progression.$$(
      "div.zyante-progression-status-bar > div"
    );
    for (const status of progression_status) {
      if (await status.evaluate((node) => node.innerText.includes("1"))) {
        await page.$eval(
          "button.zyante-progression-start-button.button",
          _click
        );
      } else {
        await page.$eval(".zyante-progression-next-button.button", _click);
      }
    }
  }
  return Promise.resolve();
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
    log(`START:\t\t\tChapter ${chapterNumber}`);
    await page.goto(chapterData[chapterNumber].startUrl);
    await page.waitForSelector("div.zybook-chapter-section-page");
    await page.waitForSelector(".zybook-section.zb-card");
    for (let i = 1; i <= chapterData[chapterNumber]["sectionCount"]; i++) {
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
      await page.waitForSelector(".zybook-section.zb-card");
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
      for (let i = 0; i < 30; i++) {
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
        chapterData[chapterNumber]["missed"] =
          missedParticipationActivities.map(
            (missedActivityID) =>
              `${page.url()}?content_resource_id=${missedActivityID}`
          );
        console.log(chapterData[chapterNumber]["missed"]);
        log(`Activities that require manual work have been logged`);
      }
      log(`FINISHED work for: Chapter ${chapterNumber} - Section ${i}`);

      // If on the last section for this chapter => return;
      if (i >= chapterData[chapterNumber]["sectionCount"]) {
        // log(`Skipping Section ${i+1}`);
        // log(`Moving to the next chapter --> Chapter ${chapterNumber+1}`);
        continue; // onto next chapter
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
            `section/${i + 1}`
          )
        );
      }
    }
    log(`!!!!!!!!!!!!!! Chapter ${chapterNumber} completed !!!!!!!!!!!!!!`);
  }
}

async function writeMissedSections() {
  const data = {};
  for (const chapter of [...Object.keys(chapterData)]) {
    const { misses } = chapter;
    data[`Chapter${chapter}`] = misses;
  }
  writeFile("missedActivities.json", JSON.stringify(data), () =>
    log("Wrote 'missedActivities.json' file")
  );
}

// Main Function
(async () => {
  const browser = await puppeteer.launch(selected_config);
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
    await login(page).catch((err) => console.log(`LOGIN ERROR: ${err}`));
    await selectzyBook(page).catch((err) =>
      console.log(`selectzyBook ERROR: ${err}`)
    );
    await completeChapters(page).catch((err) => {
      console.log(`completeChapters ERROR: ${err}`);
    });
    await writeMissedSections();
    await browser.close();
  } catch (err) {
    console.error(err);
  }
})();
