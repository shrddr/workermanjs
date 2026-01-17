export function makeIconSrc(ik) {
  //return 'https://bdocodex.com/items/new_icon/03_etc/07_productmaterial/'+`${id}`.padStart(8, '0')+'.png'
  // doesnt work, sometimes /items/new_icon/03_etc/04_dropitem/00044035.png

  //return 'https://cdn.bdolytics.com/images/items/'+`${id}`.padStart(8, '0')+'.webp'
  return `data/icons/item/${ik}.webp`
}

export function makeIconImg(ik) {
  return `<img src="${makeIconSrc(ik)}" class="iconitem" />`
}

export function formatFixed(value, digits, plus, dropZeros) {
  if (!value && value !== 0) return "?";
  const n = parseFloat(value);
  if (!isFinite(n)) return '∞';

  let s = n.toFixed(digits);

  if (dropZeros) {
    // Remove trailing zeros and possibly the dot if it's at the end
    s = s.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0*$/, '');
  }

  if (plus && n >= 0) s = "+" + s;

  return s;
}

export function randBetween(a, b) {
  return a + (b - a) * Math.random()
}

export function isNumber(value) {
   return typeof value === 'number' && isFinite(value)
}

export function isGoodVal(v) {
  return !isNaN(v) && isFinite(v)
}

export function searchSorted(arr, val) {
  // [3,5,7] size 3
  // val=2 outside left: return -1
  // val=4 inside: return 0
  // val=6 inside: return 1
  // val=8 outside right: return 3
  let start = 0;
  if (val < arr[start])
    return -1;
  let end = arr.length - 1;
  if (arr[end] < val)
    return end+1;

  while (start <= end) {
    let mid = Math.floor((start + end) / 2);

    if (arr[mid] <= val && val <= arr[mid+1]) {
      return mid;
    }

    if (val < arr[mid]) {
      end = mid - 1;
    } else {
      start = mid + 1;
    }
  }
  return -1;
}

export function binarySearch(arr, cmp) {
  let left = 0;
  let right = arr.length - 1;
  let closest = null;

  while (left <= right) {
    let mid = Math.floor((left + right) / 2);

    if (cmp(arr[mid])) {
      closest = arr[mid];
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }

  return closest;
}

export function perc2color(perc) {
	var r, g, b = 0;
	if(perc < 50) {
		r = 255;
		g = Math.round(5.1 * perc);
	}
	else {
		g = 255;
		r = Math.round(510 - 5.10 * perc);
	}
	var h = r * 0x10000 + g * 0x100 + b * 0x1;
	return '#' + ('000000' + h.toString(16)).slice(-6);
}

export function percentageToColor(val, min, max, alpha=0.5, maxHue = 120, minHue = 0) {
  var percentage = 1;
  var base = (max - min);
  if (base != 0) {
    percentage = (val - min) / base; 
  }
  const hue = percentage * (maxHue - minHue) + minHue;
  return `hsla(${hue}, 100%, 50%, ${alpha})`;
}

export function strShortenRight(str, n) {
  if (str.length <= n) {
    return str;
  } else {
    return '…' + str.slice(-n+1);
  }
}

export function strShortenLeft(str, n) {
  if (str.length <= n) {
    return str;
  } else {
    return str.slice(0, n-1) + '…';
  }
}

export function extractNumbers(str) {
  const regex = /\d+/g; // match one or more digits
  const matches = str.match(regex); // returns an array of all the matched numbers
  return matches.join('-'); // join the matches with a hyphen and return the result
}

export function formatKMG(v) {
  if (v >= 10**12)
    return v
  if (v >= 10**9)
    return v/10**9 + 'G'
  if (v >= 10**6)
    return v/10**6 + 'M'
  if (v >= 10**3)
    return v/10**3 + 'K'
  if (v > 0) {
    if (v < 10**-1)
      return v/10**-3 + 'm'
    if (v < 10**-4)
      return v/10**-6 + 'u'
    if (v < 10**-7)
      return v/10**-9 + 'n'
    if (v < 10**-10)
      return v
  }
  return v
}

export function formatPrice(n) {
  if (n === undefined) return ''
  if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.00$/, '').replace(/0$/, '') + 'b'
  if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.00$/, '').replace(/0$/, '') + 'm'
  if (n >= 1e3) return (n / 1e3).toFixed(2).replace(/\.00$/, '').replace(/0$/, '') + 'k'
  return String(n)
}

export function unformatPrice(str) {
  if (str == '') return ''
  const m = str.match(/^([\d.]+)\s*([kmb]?)$/)
  if (!m) return NaN
  return Number(m[1]) * (m[2].toLowerCase() === 'k' ? 1e3 :
                          m[2].toLowerCase() === 'm' ? 1e6 :
                          m[2].toLowerCase() === 'b' ? 1e9 : 1)
}

export function levelup(gameStore, w, targetlevel) {
  if (targetlevel == w.level) return
  const newlevel = Math.min(targetlevel, 40)
  const wstat = gameStore.workerStatic[w.charkey]
  let mspdBonus = w.mspdSheet / (wstat.mspd/100) - 1
  for (let i = w.level+1; i <= newlevel; i++) {
    w.level = i
    w.wspdSheet += randBetween(wstat.wspd_lo, wstat.wspd_hi) / 1E6
    mspdBonus += randBetween(wstat.mspd_lo, wstat.mspd_hi) / 1E6
    w.luckSheet += randBetween(wstat.luck_lo, wstat.luck_hi) / 1E4
    if (i % 5 == 0) {
      w.skills.push(gameStore.randomSkill(w.skills))
    }
  }
  w.mspdSheet = wstat.mspd/100 * (1 + mspdBonus)
}

export function hoursToHMS(hours) {
  // total seconds
  const totalSeconds = Math.floor(hours * 3600);

  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  // pad with leading zeros
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");

  return `${hh}:${mm}:${ss}`;
}