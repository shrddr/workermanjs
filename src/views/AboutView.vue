<script setup>
import QnaItem from "../components/lo/QnaItem.vue";
import LinkToNode from "../components/lo/LinkToNode.vue";
</script>

<template>
  
  <!--<NodeMapTest />-->

  <div class="about">
    <h2>Q&A</h2>
    <QnaItem>
      <template #q>
        What is the purpose of this project?
      </template>
      Optimize your <a href="https://discord.com/channels/371035077037129729/404532586246045696">#worker-empire</a> to bring more silver.
    </QnaItem>
    <QnaItem>
      <template #q>
        How to use?
      </template>
      First of all go to <strong class="notranslate">Settings</strong>, select your server and tax. After that, two options are available:
      <li>Quick and simple: do nothing and just look at <strong class="notranslate">Plantzones</strong> page - nodes at the top are good, nodes at the bottom are bad. Use Plantzones page if just starting out.</li>
      <li>Personalized and nuanced: go to <strong class="notranslate">Home</strong> page, select a town, hire a worker, send to whatever node gives highest efficiency, repeat. Use Home page if you want to improve or rework an existing empire.</li>
    </QnaItem>
    <QnaItem>
      <template #q>
        Is there any video or guide?
      </template>
      <a href="https://youtu.be/EknUHU1Lvq0">Setup and Usage by Yura</a>, <a href="https://youtu.be/sEHK7cX4SIE">Best Workers Video by Summer</a>
    </QnaItem>
    <QnaItem>
      <template #q>
        How do i make an empire optimized for cooking/alchemy?
      </template>
      Only difference is you don't tax cooking/alchemy mats (mark as Keep on <strong class="notranslate">Settings</strong> page). You are still going to be recommended nodes with unwanted mats, just sell the output and use that $ to buy whatever you need. If you want to completely avoid some item put in 0 as its Custom Value.
    </QnaItem>
    <QnaItem>
      <template #q>
        What does <strong class="notranslate">+efficiency</strong> column mean and why is it always negative for me?
      </template>
      It shows the change in total efficiency (M$/day/CP) of the empire after starting this job with this worker. 
      It being always negative is good - means you already own all the best nodes, so remaining ones are less efficient.
      You want to spend all available CP anyway, so just select those that are least negative (= highest in list).
    </QnaItem>
    <QnaItem>
      <template #q>
        I checked the plantzones page X months ago and it showed best worker is Y and now shows Z, why?
      </template>
      Because market prices change over time.
    </QnaItem>
    <QnaItem>
      <template #q>
        Why are node connections so bad? When building path from town <strong class="notranslate">A</strong> to node <strong class="notranslate">B</strong>, it ignores the fact that there is already taken node <strong class="notranslate">C</strong> on the way.
      </template>
      Connections are resolved in same order the jobs were given. 
      The worker who received the job first doesn't know yet about all others, and builds connection in a beeline.
      Each next worker sees and uses more and more connections made by previous workers in queue.
      You can push the worker at <strong class="notranslate">B</strong> to the end of queue by restarting his job in workerman (press <strong class="notranslate">stop</strong> and assign again). 
      His connection will then be built last, with full knowledge of previous connections including the one that activated <strong class="notranslate">C</strong>.
    </QnaItem>
    <QnaItem>
      <template #q>
        Where does the drop data come from and how old?
      </template>
      Unlucky drops up to Eternal Winter: from an anonymous source somewhere on the internet,
      timestamped late 2021. I checked ~50 top profit nodes ingame and they matched, so the rest are assumed good. Might have changed in the meantime.<br/>
      Unlucky drops in Eternal Winter: observed near mid 2022.<br/>
      Lucky drops across all regions: observed in june 2023.<br/>
      Morning Land drops: observed at summer 2023 - regular nodes are fine, excavations are approximate, too rare to judge confidently
      <li>circumstantial evidence added in for more volume:
        <a href="https://discord.com/channels/371035077037129729/404532586246045696/1126036873450631198">1</a>, 
        <a href="https://discord.com/channels/371035077037129729/404532586246045696/1142011540648763403">2</a>
      </li>
      Also, it is currently unclear how giant bonus interacts with sacks - giants bring just a bit more (but stastically significant) sacks than theoretically expected, reason unknown
    </QnaItem>
    
    <h2>Tips & tricks</h2>
    <ul style="padding-left: 16px;">
      <li>
        <details><summary>Anywhere you see a right facing triangle, click to expand</summary>
          click again to hide
        </details>
      </li>
      <li>Also hover over <abbr class="tooltip" title="water is wet">ℹ️</abbr>'s and other <abbr class="tooltip" title="roses are blue">dot-underlined</abbr> things to see useful info</li>
      <li>Spend some time on item valuation on Settings page: set <strong class="notranslate">Custom</strong> value above market price for bottlenecked stuff, reduce the value for mats you don't want</li>
      <li>Home page > <strong class="notranslate">Empire</strong> pane has some useful stats. Get rid of <strong class="notranslate">Worst Taken</strong> and acquire <strong class="notranslate">Best Untaken</strong></li>
      <li>Use <strong class="notranslate">optimize</strong> button inside a working worker's editor and see what skills to roll to maximize profit, then <strong class="notranslate">revert</strong> back</li>
        <ul>
          <li>if you're not max level though, level up with 🠕 button first to see what the "endgame" optimal skills are as opposed to currently optimal skills</li>
          <li>you can also change the type of worker here and the stats will be recalculated as if levelled from scratch with same stat rolls</li>
        </ul>
      <li>If you have nodes invested for grinding, mark them with <strong class="notranslate">zero-cost connection</strong> checkbox - this will make nearby plantzones more desirable</li>
        <ul>
          <li>just like with ordinary nodes, order matters - if they don't want to chain properly, try to reorder (ex: activate Olun before Crypt). Order is shown in <strong class="notranslate">Total CP</strong> pane</li>
          <li>if a zero-cost connects to a wrong town, assign a whole chain of zero-costs along the path you want (usually just 1 dummy halfway is enough)</li>
        </ul>
      <li>Use <strong class="notranslate">import</strong> and <strong class="notranslate">export</strong> buttons in <strong class="notranslate">All towns/workers list</strong> to:
        <ul>
          <li>compare different builds</li>
          <li>restore to a known state when messed up</li>
          <li>share your setup with other people</li>
          <li>pull actual worker stats from your PC (ty @Aman, @Thell, @Sbreeng, @thirtyeight):</li>
          <ul>
            <li>download and install <a href="https://www.python.org/">Python</a> 3.9+</li>
            <li>download the <a href="https://pastebin.com/yxsQQdxj">Import Script</a>, and run it through Python</li>
            <li>now head back to Workerman Home page > All towns/workers list > import the json file you just created by running the script</li>
          </ul>
          <li>warning: if the amount of workers you have ingame is outside the F2P town limits, enter P2W lodging in town config <u>before</u> importing, otherwise the housing will not resolve</li>
          <li>note: the script doesn't really fetch <i>current</i> jobs, but the jobs associated with ingame "restart job" button of each worker. each restartable worker also has a reset button ingame that clears the cached job.</li>
        </ul>
      </li>
      <li>Workloads (and therefore profits) depend on <strong class="notranslate">Modifiers</strong>. 
        The default value works well for highly contested nodes (they are popular for a reason - you probably want them too).
        Some niche nodes however can report up to 2x higher profit if you enter their real Modifiers.
        <ul>
          <li>Each green bar ingame does not belong to single resource node, but to a piece of land (aka RegionGroup), which may can contain multiple resource nodes, so they share the modifier</li>
          <li>If you want to be really meticulous about it, switch to floating modifiers (in Modifiers > Advanced) and track the ingame modifiers change over time. More observations - more accuracy</li>
          <ul>
            <li>With floating modifier, daily profit is calculated via the chance of reaching relevant workload breakpoints on each cycle. Detailed view available in edit worker dialog</li>
            <li>Workloads shown in ~XXX format refer to median (50% chance) value. This is for reference only and is not used in profit calculations, the whole dataset is</li>
            <li>You can specify to use either constant or floating modifier for each RegionGroup</li>
          </ul>
        </ul>
      </li>
    </ul>


    <h2>Changelog</h2>
    <li>workshop tweaks</li>
    <ul>
      <li>worker packing skills now improve profit (please review $/cycle column in 🏭Workshops config, probaly needs to be reduced accordingly)</li>
      <li>skill #1008 (refining) affects crate packing workspeed</li>
      <li>added intracity distances for workshops (and improved intercity)</li>
      <li>remote town workshop job requires (creates) a connection</li>
      <li>Home page > selected town has workshop section, sorted by type</li>
    </ul>
    <li>fixed unexpected lodging redirect when using "send worker to" dialog > stash dropdown set to a remote town</li>
    <li>Home > Empire > Daily yields has feed calc at bottom</li>
    <li>map: a setting to hide all inactive elements</li>
    <li>if any of jobs originating in a town has negative income, this town lodgage costs will be split between jobs equally (not proportionally) </li>
    <li>allowed storage use at oquilla, asparkan, velandir, muzgar (the last one is also slightly upgradeable)</li>
    <li>updated all trace plantzones to output same amount of item 5960</li>
    <li>updated sacks 1024 to contain 1x item 5205 and 1026 to contain 1x item 5960</li>
    <li>changed plantzone 1560 to use Lumbering lucky drops despite having Gathering icon, tweaked a couple of trace droprates</li>
    <li>[2023-05-31 patch] new luck drops (current version: 13 aka the final one. data collection stopped)</li>
      <ul>
        <li>all nodes of kind 4 (plant growing): all luck drops replaced with 0.3x item 1024</li>
        <li>all nodes of kind 6 (plant gathering): all luck drops replaced with 0.13x item 1024</li>
        <li>all nodes of kind 7 (mining): all luck drops replaced with 3.5x item 1025</li>
        <li>all nodes of kind 8 (lumbering): all luck drops replaced with 1x item 5005, 0.5x 5006, 0.15x 5007, 2.1x 5008, 1x 5011</li>
        <li>all nodes of kind 11 (dried fish): all luck drops replaced with 0.17x item 1027, 0.77x 6501</li>
        <li>all nodes of kind 15 (excavation): all luck drops replaced with 4x item 1026</li>
        <li>nodes 1675, 1677, 1776: unlucky drop increased to 8 (not mentioned in patch notes, maybe happened on an earlier date)</li>
        <li>nodes 1565, 1779: added 2x luck procs</li>
      </ul>
    <li>added TW language</li>
    <li>Plantzones page > added town filter</li>
    <li>[2024-01-31 patch] extended Ulukita region (still 0 plantzones)</li>
    <li>added JP language</li>
    <li>[2023-11-08 patch] replaced junk yields with ores at <details><summary>10 excavation nodes. yields are approximate</summary>
      <LinkToNode :nodeKey="144"/>,
      <LinkToNode :nodeKey="480"/>, 
      <LinkToNode :nodeKey="488"/>, 
      <LinkToNode :nodeKey="842"/>, 
      <LinkToNode :nodeKey="902"/>, 
      <LinkToNode :nodeKey="912"/>, 
      <LinkToNode :nodeKey="1220"/>, 
      <LinkToNode :nodeKey="1553"/>, 
      <LinkToNode :nodeKey="1687"/>, 
      <LinkToNode :nodeKey="1688"/>
    </details></li>
      
    <li>[2023-11-08 patch] increased lumbering byproducts yields by set multipliers at <details><summary>17 lumbering nodes</summary>
      <LinkToNode :nodeKey="142"/>,
      <LinkToNode :nodeKey="167"/>, 
      <LinkToNode :nodeKey="183"/>, 
      <LinkToNode :nodeKey="455"/>, 
      <LinkToNode :nodeKey="464"/>, 
      <LinkToNode :nodeKey="834"/>, 
      <LinkToNode :nodeKey="855"/>, 
      <LinkToNode :nodeKey="905"/>, 
      <LinkToNode :nodeKey="908"/>, 
      <LinkToNode :nodeKey="952"/>, 
      <LinkToNode :nodeKey="1212"/>, 
      <LinkToNode :nodeKey="1215"/>, 
      <LinkToNode :nodeKey="1216"/>, 
      <LinkToNode :nodeKey="1219"/>, 
      <LinkToNode :nodeKey="1777"/>,
      <LinkToNode :nodeKey="1820"/>,
      <LinkToNode :nodeKey="1821"/>
    </details></li>
    <li>[2023-11-01 patch] increased all trace yields</li>
      <ul>
        <li>
          <details><summary>Main continent: x2</summary>
            <LinkToNode :nodeKey="144"/>,
            <LinkToNode :nodeKey="480"/>, 
            <LinkToNode :nodeKey="488"/>, 
            <LinkToNode :nodeKey="842"/>, 
            <LinkToNode :nodeKey="902"/>, 
            <LinkToNode :nodeKey="912"/>, 
            <LinkToNode :nodeKey="1220"/>, 
            <LinkToNode :nodeKey="1553"/>, 
            <LinkToNode :nodeKey="1637"/>, 
            <LinkToNode :nodeKey="1687"/>, 
            <LinkToNode :nodeKey="1688"/>, 
            <LinkToNode :nodeKey="1709"/>, 
            <LinkToNode :nodeKey="1716"/>, 
            <LinkToNode :nodeKey="1720"/>, 
            <LinkToNode :nodeKey="1770"/>, 
            <LinkToNode :nodeKey="1778"/>
          </details>
        </li>
        <li>
          <details><summary>Morning land: x5</summary>
            <LinkToNode :nodeKey="1807"/>, 
            <LinkToNode :nodeKey="1808"/>, 
            <LinkToNode :nodeKey="1809"/>, 
            <LinkToNode :nodeKey="1823"/>, 
            <LinkToNode :nodeKey="1830"/>
          </details>
        </li>
      </ul>
    <li>[2023-11-01 patch] increased all sap yields</li>
      <ul>
        <li>
          <details><summary>Maple & Pine Sap: x1.5</summary>
            <LinkToNode :nodeKey="443"/>,
            <LinkToNode :nodeKey="910"/>,
            <LinkToNode :nodeKey="1216"/>,
            <LinkToNode :nodeKey="1685"/>
          </details>
        </li>
        <li>
          <details><summary>Snowfield Cedar Sap: x5</summary>
            <LinkToNode :nodeKey="1771"/>,
            <LinkToNode :nodeKey="1780"/>
          </details>
        </li>
        <li>
          <details><summary>Other Sap: x2</summary>
            <LinkToNode :nodeKey="160"/>,
            <LinkToNode :nodeKey="840"/>,
            <LinkToNode :nodeKey="901"/>,
            <LinkToNode :nodeKey="903"/>,
            <LinkToNode :nodeKey="907"/>,
            <LinkToNode :nodeKey="1212"/>,
            <LinkToNode :nodeKey="1215"/>,
            <LinkToNode :nodeKey="1219"/>,
            <LinkToNode :nodeKey="1502"/>,
            <LinkToNode :nodeKey="1504"/>,
            <LinkToNode :nodeKey="1512"/>,
            <LinkToNode :nodeKey="1516"/>,
            <LinkToNode :nodeKey="1526"/>,
            <LinkToNode :nodeKey="1635"/>,
            <LinkToNode :nodeKey="1638"/>,
            <LinkToNode :nodeKey="1683"/>,
            <LinkToNode :nodeKey="1684"/>,
            <LinkToNode :nodeKey="1686"/>,
            <LinkToNode :nodeKey="1712"/>,
            <LinkToNode :nodeKey="1715"/>,
            <LinkToNode :nodeKey="1560"/>
          </details>
        </li>
      </ul>
    <li>implemented manual output redirection (available at any worker level for easier prototyping)</li>
    <li>added separate VP setting to add 16 P2W slots to every town</li>
    <li>[2023-08-23 patch] added new Ulukita region with 0 plantzones</li>
    <li>added KR language</li>
    <li>[2023-03-10 patch] item 4206 yields tripled at 3 plantzones</li>
    <li>housing config > items are now sorted exactly as ingame</li>
    <li>home page > added worker icon, level, and optional stat rank (also always shown in editor)</li>
    <li>added lodgage costs to Empire > Best Untaken</li>
    <li>skip unknown (event?) plantzone jobs when importing - will display as an idle worker instead</li>
    <li>Empire > Best Untaken selects best species automatically</li>
    <li>[2023-06-05 patch] added node 1833</li>
    <li>[2023-05-31 patch] big rework</li>
      <ul>
        <li>level cap 40, +2 skill slots</li>
        <li>humans got +3 luck</li>
        <li>giants got +68.4% yield of <s>all</s> all unlucky drops, rounded down</li>
      </ul>
    <li>fixed warehouse slot calculations to require lucky items too + 1 slot required to be free</li>
    <li>[2023-06-14 patch] added LotML region with 24 nodes</li>
    <li>in darkmode, buttons are now actually dark</li>
    <li>[2023-05-31 patch] added sack items with auto-calculated prices</li>
      <ul>
        <li>item 1024 = equal chance of 1x any fruit</li>
        <li>item 1025 = equal chance of 1x any gem</li>
        <li>item 1026 = equal chance of 1x any trace</li>
        <li>item 1027 = equal chance of 1x any coral</li>
      </ul>
    <li>you don't buy houses anymore, optimal lodging & storage provided automatically</li>
      <ul>
        <li>check town <strong class="notranslate">config</strong> to see which houses to buy</li>
        <li>be careful to not exceed the town limits, profits will show <strong class="notranslate">NaN</strong>'s and <strong class="notranslate">?</strong>'s if you do, and whole town marked red in town list</li>
        <li>for easier prototyping, idle workers do not consume lodging</li>
      </ul>
    <li>[2023-05-03 patch] reduced 10 fences cost to 80 CP</li>
    <li>reimplemented workshop jobs to stay after worker reimport</li>
      <ul>
        <li>each house can be set up in <strong class="notranslate">Settings &gt; Workshops config</strong> and stored separately from worker data</li>
        <li>previously assigned <strong class="notranslate">🏭Workshop</strong> jobs have been converted into <strong class="notranslate">✍️Custom</strong> jobs</li>
      </ul>
    <li>on town/node click, map pans to its location</li>
    <li>removed 13 nodes that are invisible ingame</li>
    <li>added a ranking of untaken nodes in Empire pane</li>
    <li>[2023-02-21 patch] updated node CP costs</li>
    <li>job efficiency now includes lodging cost: eff = income / (connectionCost + lodgingCost)</li>
      <ul>
        <li>lodging costs are shared proportionally to job income values, same way as connections</li>
      </ul>
    <li>added more worker types + seamless transition between</li>
    <li>can specify a zero-cost connection in node properties (when invested for droprate)</li>
    <li>individual plantzone efficiency via cashflow</li>
      <ul>
        <li>ex: if a connection node is simultaneously used by a 4M$/day job and a 1M$/day job, they own it in 80/20 fashion</li>
      </ul>
    <li>added farming and workshop job types in Send Worker dialog</li>
    <li>/plantzones page tweaks</li>
      <ul>
        <li>node name link navigates to its map location (upd: with permalinks)</li>
        <li>item link navigates to its settings price row</li>
        <li>shows item names to allow in-browser search</li>
        <li>selects nearest town by CP instead of distance</li>
      </ul>
    <li>removed Blue Maned Lion's Manor</li>
    <li>~floating modifiers support</li>
    <li>selecting a node highlights connection path</li>
    <li>worker job assignment moves to the end of connection queue</li>
    <li>worker editor: added button to suggest best skills for current job</li>
    <li>map: color active/inactive links</li>
    <li>updated connection algorithm to encourage existing paths reuse</li>
    <li>[2022-10-26 patch] updated house CP costs</li>
    <li>worker revert button, plantzone luck effect indicator</li>
    <li>configurable default worker for hire</li>
    <li>send worker dialog: show worker stats</li>
    <li>worker editor: when on job, show profit changes while editing</li>
    <li>node info: show/edit the workload modifier</li>
    <li>Ancado lodging now requires other town connection (nearest chosen automatically)</li>
    <li>added nodes 911..914 & 1604 (ty @Ayashi)</li>
    <li>added total daily items summary</li>
    <li>added workers+lodging import/export to json file</li>
    <li>[2022-09-21 patch] updated several node distances</li>
    <li>added worker management</li>
    <li>combined repeated items in node 1035 (ty @Yazel)</li>
    <li>[2022-08-31 patch] modified nodes 463 & 487 for lucky drop 5422 instead of 5402</li>
    

    <h2>Todo</h2>

    <li>prevent plantzones page trying to use Oquilla as origina</li>
    <li>for some reason mousemove while hovering a node triggers continuous recalculations</li>
    <li>empire > best untaken > automatically try alternative stashes</li>
    <li>change (again) the job resource sharing principle when negative profit jobs are involved</li>
      <ul>
        <li>when positive profit jobs A, B and negative profit jobs C, D are sharing the same resource,
          A and B should split half of the resource proprtionally to their profits, while
          C and D should split the remaining half of the resource equally
        </li>
      </ul>
    <li>more pronounced warning when unable to resolve housing</li>
    <li>home > on inactive plantzone hover show the profit estimate (with optimal worker from optimal town?)</li>
    <li>need to rethink default "random art gob" hire since gobs are not BiS anymore</li>
      <ul>
        <li>a quick popup would be nice right after clicking <strong>hire</strong> asking 👺 or 🐢</li>
        <li>need to get a list of hireables per town to hire town-specific kind of 👺</li>
        <ul>
          <li>investigate via worker registration items (id 64000+)</li>
        </ul>
      </ul>
    <li>totals > split out personal items storage CP</li>
      <ul>
        <li>make multiple queries to housecraft and compare</li>
      </ul>
    <li>handle lodging/storage in steps (like in AstroAllano's sheet) instead of linear sharing</li>
      <ul>
        <li>same idea with connections</li>
      </ul>
    <li>worker editor > hide charkeys not hireable in current town</li>
    <li>smart worker↔job rearrangement within a town</li>
      <ul>
        <li>take both innate stat, current skills and potential reroll prospects into account</li>
      </ul>
    <li>on first run, pick server using geoip</li>
    <li>some of morningland workers' levelup stats still unknown, using values from older regions</li>
    <li>[2023-05-31 patch]</li>
      <ul>
        <li>implement species-restricted plantzones and workshops</li>
      </ul>
    <li>when exporting/importing, show what exactly is being -ported (maybe even choose?)</li>
    <li>show real house positions in housecraft viewer</li>
    <li>when optimizing skills, try to keep new skill of same type at same position as old one</li>
      <ul>
        <li>don't optimize +2 wspd into +2 wspd with no benefit</li>
      </ul>
    <li>find a consistent fast way to build optimal connections (orderless)</li>
    <li>add lodgage support to workshop system</li>
    <li>on item icon hover: show name and price</li>
    <li>workerlist: show drops instead of pzname</li>
    <li>grade towns/workers graphically with bar charts</li>
    <li>map tweaks
      <ul>
        <li>node hover: highlight potential path to town</li>
        <li>save zoom too in addition to pos</li>
        <li>deal with missing tiles</li>
      </ul>
    </li>
    <li>profit calculation: include feed cost</li>
    <li>map: optionally show RegionGroups</li>
    <li>unify strings - Erdal Farm shows "gathering" while ingame workerlist shows "silk production"</li>
    <li>introduce skill roll chances somehow</li>
    <ul>
      <li>help decide which skills should and should not be rerolled?</li>
      <li>ex: for existing worker skill, show if it's going to get better or worse after 5 rerolls</li>
    </ul>
    <li>detect unsellable items using current market offers divided by lifetime volume</li>
    <ul>
      <li>different items have different lifetime though</li>
    </ul>
    <li>detect and apply price floors and ceilings (±7.5%)</li>
    <li>show market fetch timestamp</li>
    <li> </li>
    
    <h2>Misc</h2>
    <p><RouterLink to="/workshops">House Usage</RouterLink></p>
    <p><RouterLink to="/housecraft">HouseCraft Viewer</RouterLink></p>
    <p><RouterLink to="/droprates">Droprates</RouterLink></p>
    <p><RouterLink to="/routertests">Router Tests</RouterLink></p>
    <p><RouterLink to="/lodging">All Towns Lodging (deprecated)</RouterLink></p>
  </div>
</template>

<style scoped>
strong {
  font-weight: 600;
}

.tooltip {
  cursor: help;
}
</style>
