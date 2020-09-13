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
  slowMo: 0,
  timeout: 30000,
};

const log = (string) => {
  if (!string || !o_debug) return;
  // Im tired and this is all i want right now for this to work
  let now = new Date();
  let time = now.toString().match(/(.+?)\sGMT/i)[1];
  console.log(`[${time}] - ${string}`);
};

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
  // log("Waiting 5 seconds for it to load.");
  // await page.waitForTimeout(5000); // wait for 5 seconds to let it log you in
  // log("Resuming...");
  return page;
}

async function selectzyBook(page) {
  log("Navigating to course page (using the predefined course code)");
  await page.goto("https://learn.zybooks.com/zybook/" + creds.zybook);
  await page.waitForSelector("div.zybook-index-page");
  // log("Waiting 5 seconds for it to load.");
  // await page.waitForTimeout(5000); // wait for 5 seconds to let it load
  // log("Resuming...");
  const chapters = await page.$$(".chapter-item");
  log(`There are ${chapters.length} chapters to choose from!`);
  // await page.$$eval(".chapter-item", chapter => {
  //   console.log("Chapter: " + chapter);
  //   document.querySelector(chapter).querySelector("h3").click();
  // });
  await page.evaluate(() => {
    document.querySelectorAll(".chapter-item h3").forEach((e) => {
      e.click();
    });
  });
  // log("Waiting 9 seconds for everything to load.")
  // await page.waitForTimeout(9000);
  await chapters.forEach(async (e, idx) => {
    ////// Failed to get hrefs so chapter links
    // await page.evaluate(chapter => chapter.click(), e);
    // // await e.click();
    // log("Waiting 3 seconds for it to load.");
    // await page.waitForTimeout(3000);
    // log("Resuming...");
    // // console.log(idx, " - ", e);
    // await e.click();
    // await page.waitForSelector(".chapter-item li");
    const sectionCount = (await e.$$("li")).length;
    console.log("len: " + await sectionCount);

    // If current section number is less than the sectionCount. click .nav-text.next
    let chapterNumber = `${idx + 1}`;
    chapterData[chapterNumber] = {};
    chapterData[chapterNumber]["sectionCount"] = await sectionCount;
    chapterData[chapterNumber][
      "startUrl"
    ] = `https://learn.zybooks.com/zybook/WISCCOMPSCI240MATH240HastiFall2020/chapter/${chapterNumber}/section/1`;
    // console.log(await chapterData[chapterNumber]);
    // if (chapters.length == idx + 1) {
    //   console.log("WE ARE DONE WITH THIS THEN THE NEXT FUNCTION SHOULD BE CALLED NOW!");
    //   return page;
    // }
  });
  return page;
}

async function playAnimations(page) {
  const animation_players = page.$$(
    "div.interactive-activity-container.animation-player-content-resource.participation.ember-view"
  );
  animation_players.forEach(async (animation) => {
    await page.click("div.section-header-row", {
      button: "left",
      clickCount: 1,
      delay: 0,
    });
    const double_speed = animation.$("div.speed=control");
    await double_speed.click({
      button: "left",
      clickCount: 1,
      delay: 0,
    });
    const start_button = animation.$(
      "button.start-button.start-graphic.zb-button.primary.raised.ember-view"
    );
    start_button.click({
      button: "left",
      clickCount: 1,
      delay: 0,
    });
    while (true) {
      if ([...animation.$$("div.pause-button")].length > 0) {
        continue;
      }
      const play_button = animation.$("div.play-button.bounce");
      if (play_button) {
        await play_button.click({
          button: "left",
          clickCount: 1,
          delay: 0,
        });
      }
      if ([...animation.$$("div.play-button.rotate-180")].length > 0) {
        break;
      }
    }
    console.log("Completed animation activity");
  });
}

/*

def completeMatching(driver):
	matching_sets = driver.find_elements_by_xpath("//div[@class='interactive-activity-container custom-content-resource participation large ember-view']")
	matching_sets += driver.find_elements_by_xpath("//div[@class='interactive-activity-container custom-content-resource participation medium ember-view']")
	matching_sets += driver.find_elements_by_xpath("//div[@class='interactive-activity-container custom-content-resource participation small ember-view']")
	for matching in matching_sets:
		driver.find_element_by_xpath("//div[@class='section-header-row']").click()
		while(True):
			try:
				choice = matching.find_element_by_xpath(".//div[@class='js-draggableObject draggable-object ember-view']")
				choice_text = matching.find_element_by_xpath(".//div[@class='js-draggableObject draggable-object ember-view']/div/span").text
				choice.click()
			except:
				break
			empty_bucket = matching.find_element_by_xpath(".//div[@class='definition-drag-container flex-row    draggable-object-target ember-view']")
			empty_bucket_text = matching.find_element_by_xpath("./..//div[@class='definition']").text
			empty_bucket.click()
			action = ActionChains(driver)

			#The following and all other drag and drop operations within the matching activity type fails to actually move an option into a bucket in Firefox
			#The drag_and_drop() function itself works perfectly fine, but something about the zyBooks site prevents the releasing of an option into a bucket from registering
			#My suspicion is that manually doing it triggers some javascript that opens the bucket for dropping, but selenium actions do not trigger that javascript
			#I have tried every alternative method for performing the operation that I could possibly think of, but none work
			action.drag_and_drop(choice, empty_bucket).perform() #the drag and drop operation in question
			populated_buckets = matching.find_elements_by_xpath(".//div[@class='js-draggableObject draggable-object ember-view']")
			current_bucket = None
			for populated_bucket in populated_buckets:
				if(populated_bucket.find_element_by_xpath("./../../div[@class='definition']").text == empty_bucket_text):
					current_bucket = populated_bucket
			if(current_bucket.find_elements_by_xpath("./../..//div[@class='explanation correct']")):
				continue
			remaining_empty_buckets = matching.find_elements_by_xpath(".//div[@class='term-bucket ']")
			for bucket in remaining_empty_buckets:
				populated_buckets = matching.find_elements_by_xpath(".//div[@class='js-draggableObject draggable-object ember-view']")
				for populated_bucket in populated_buckets:
					if(populated_bucket.text == choice_text):
						choice = populated_bucket
						break
				ActionChains(driver).drag_and_drop(choice, bucket).perform()
				bucket.click()
				if(bucket.find_elements_by_xpath("./../..//div[@class='explanation correct']")):
					break
*/

async function completeCustomInteractions(page) {
  const custom_activties = page.$$(
    "div.interactive-activity-container.custom-content-resource.participation.ember-view"
  );
  custom_activties.forEach(async (activity) => {
    await page.click("div.section-header-row", {
      button: "left",
      clickCount: 1,
      delay: 0,
    });
    const buttons = activity.$$("button.button");
    buttons.forEach(async (button) => {
      await button.click({
        button: "left",
        clickCount: 1,
        delay: 0,
      });
    });
  });
}

async function completeMultipleChoice(page) {
  const multiple_choice_sets = page.$$(
    "div.interactive-activity-container.multiple-choice-content-resource.participation.ember-view"
  );
  multiple_choice_sets.forEach(async (question_set) => {
    await page.click("div.section-header-row", {
      button: "left",
      clickCount: 1,
      delay: 0,
    });
    const questions = question_set.$$(
      "div.question-set-question.multiple-choice-question.ember-view"
    );
    questions.forEach(async (question) => {
      const choices = question.$$("label[aria-hidden='true']");
      choices.forEach(async (choice) => {
        await choice.click({
          button: "left",
          clickCount: 1,
          delay: 0,
        });
        if (
          [...question.$$("div.explanation.has-explanation.correct")].length > 0
        ) {
          break;
        }
      });
    });
    console.log("Completed multiple choice set");
  });
}

async function completeShortAnswer(page) {
  const short_answer_sets = page.$$(
    "div.interactive-activity-container.short-answer-content-resource.participation.ember-view"
  );
  short_answer_sets.forEach(async (question_set) => {
    await page.click("div.section-header-row", {
      button: "left",
      clickCount: 1,
      delay: 0,
    });
    const questions = question_set.$$(
      "div.question-set-question.short-answer-question.ember-view"
    );
    questions.forEach(async (question) => {
      const show_answer_button = question.$(
        "button.show-answer-button.zb-button.secondary.ember-view"
      );
      await show_answer_button.click({
        button: "left",
        clickCount: 2,
        delay: 500,
      });
      const answer = question.$("span.forfeit-answer").innerText;
      const text_area = question.$(
        "textarea.zb-text-area.hide-scrollbar.ember-text-area.ember-view"
      );
      await text_area.type(answer, { delay: 25 });
      const check_button = question.$(
        "button.check-button.zb-button.primary.raised.ember-view"
      );
      await check_button.click({
        button: "left",
        clickCount: 1,
        delay: 0,
      });
    });
    console.log("Complete short answer set");
  });
}

async function completeSelectionProblems(page) {
  const selection_problem_sets = page.$$(
    "div.interactive-activity-container.detect-answer-content-resource.participation.ember-view"
  );
  selection_problem_sets.forEach(async (question_set) => {
    await page.click("div.section-header-row", {
      button: "left",
      clickCount: 1,
      delay: 0,
    });
    const questions = question_set.$$(
      "div.question-set-question.detect-answer-question.ember-view"
    );
    questions.forEach(async (question) => {
      const choices = question.$$("div.unclicked");
      choices.forEach(async (choice) => {
        await choice.click({
          button: "left",
          clickCount: 1,
          delay: 0,
        });
        if (
          [...question.$$("div.explanation.has-explanation.correct")].length > 0
        ) {
          break;
        }
      });
    });
    console.log("Completed selection problem set");
  });
}

async function completeProgressionChallenges(page) {
  const progression_challenges = page.$$(
    "div.interactive-activity-container.custom-content-resource.challenge.ember-view"
  );
  progression_challenges.forEach((progression) => {
    let progression_status = progression.$$(
      "div.zyante-progression-status-bar > div"
    );
    progression_status.forEach(async (status) => {
      if (status.innerText.includes("1")) {
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
    });
  });
  return;
}

async function completeParticipationActivities(page) {
  await playAnimations(page);
  await completeCustomInteractions(page);
  await completeMultipleChoice(page);
  await completeShortAnswer(page);
  // await completeMatching(page);
  await completeSelectionProblems(page);
  return;
}

async function completeChapters(page) {
  creds.chaptersToComplete.forEach(async (chapterNumber) => {
    await page.goto(chapterData[chapterNumber].startUrl);
    for (let i = 1; i < chapterData[chapterNumber]["sectionCount"]; i++) {
      await completeParticipationActivities(page);
      await page.click("span.nav-test.next");
      await page.waitForSelector(".zybook-section.zb-card.ember-view");
    }
  });
}

(async () => {
  const browser = await puppeteer.launch(puppetConfigDebug);
  const page = await browser.newPage();
  await page.setViewport({
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
  });
  try {
    await login(page).catch(err => console.log("ERROR!!11!111!! " + err));
    await selectzyBook(page).catch(err => console.log("ERROR!!!!! " + err));
    await completeChapters(page).catch(err=>{console.log("ERROR!!!!!22222 " + err)});
  } catch (err) {
    console.error(err);
  }
})();
