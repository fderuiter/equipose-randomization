import { RandomizationConfig } from '../../../../core/models/randomization.model';
import { LogicIR } from '../ir/ir.model';
import { LanguageConfig } from './language-config';
import { FormattingUtil } from '../formatting.util';
import { CodeTranspiler } from '../ir/transpiler';
import { PRECISION_EPSILON, PRECISION_SCALE } from '../../../../../core/constants/precision.config';

export class AlgorithmRegistry {
  static buildDynamicLogic(configObj: LanguageConfig, config: RandomizationConfig, ir: LogicIR): string {
    let logic = '';
    
    // 1. Initialization logic
    logic += configObj.components.initialization(ir, config);
    
    // 2. Utility Section (Fisher-Yates, Build Block, Checksum, etc.)
    const utilComment = configObj.language === 'SAS' ? '/* === UTILITY SECTION === */\n' : 
                        configObj.language === 'STATA' ? '// === UTILITY SECTION ===\n' : 
                        '# === UTILITY SECTION ===\n';
    logic += '\n' + utilComment;
    
    if (configObj.components.utilityBlocks) {
       logic += configObj.components.utilityBlocks(ir) + '\n';
    } else {
       if (configObj.components.fisherYates) {
          logic += configObj.components.fisherYates(ir) + '\n';
       }
       if (configObj.components.buildBlock) {
          logic += configObj.components.buildBlock(ir) + '\n';
       }
    }
    
    logic += '\n';

    // 3. Round-Robin Loop logic
    logic += configObj.components.roundRobinLoop(ir, config);

    // 4. Post Loop logic (e.g., Stata Mata export)
    if (configObj.components.postLoop) {
      logic += configObj.components.postLoop(ir, config);
    }
    
    return logic;
  }

  static buildDynamicMinimizationLogic(language: 'R' | 'SAS' | 'Python' | 'STATA', config: RandomizationConfig, ir: LogicIR): string {
    const arms = ir.arms;
    let armRatioLcm = 1;
    for (const arm of arms) {
      if (arm.ratio > 0) {
        const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
        const lcm = (a: number, b: number): number => (a * b) / gcd(a, b);
        armRatioLcm = lcm(armRatioLcm, arm.ratio);
      }
    }
    const ratioMultipliers: Record<string, number> = {};
    for (const arm of arms) {
      ratioMultipliers[arm.id] = arm.ratio > 0 ? armRatioLcm / arm.ratio : 0;
    }

    const strata = config.strata || [];
    let activePool: Record<string, string>[] = [{}];
    for (const factor of strata) {
      const newCombinations: Record<string, string>[] = [];
      for (const combo of activePool) {
        for (const level of factor.levels) {
          newCombinations.push({ ...combo, [factor.id]: level });
        }
      }
      activePool = newCombinations;
    }

    const capsDict: Record<string, number> = {};
    (config.stratumCaps || []).forEach(c => {
      if (c.levelIds) {
        const key = Object.keys(c.levelIds).sort().map(k => `${k}:${c.levelIds[k]}`).join('|');
        capsDict[key] = c.cap;
      }
    });

    const getIntersectionKey = (stratum: Record<string, string>): string => {
      return Object.keys(stratum).filter(k => k !== '_key').sort().map(k => `${k}:${stratum[k]}`).join('|');
    };

    const validPool = activePool.filter(combo => {
      const key = getIntersectionKey(combo);
      const cap = capsDict[key];
      return cap === undefined || cap > 0;
    });

    if (language === 'Python') {
      let code = `import threading

# Global thread synchronization lock to prevent race conditions in multi-user environments
lock = threading.Lock()

class KeyException(Exception):
    pass

class RobustDict(dict):
    def __getitem__(self, key):
        if key not in self:
            raise KeyException(f"Key '{key}' not found in configuration.")
        return super().__getitem__(key)

# Strata configuration
strata = RobustDict()
`;
      strata.forEach(f => {
        const levelsStr = f.levels.map(l => `"${FormattingUtil.escapeString(l)}"`).join(', ');
        const probsStr = f.levels.map(lvl => {
          const det = f.levelDetails?.find(d => d.name === lvl);
          return det && det.expectedProbability !== undefined ? det.expectedProbability : 'None';
        }).join(', ');
        code += `strata["${FormattingUtil.escapeString(f.id)}"] = RobustDict({"levels": [${levelsStr}], "expected_probs": [${probsStr}]})\n`;
      });
      code += `
arms = [
`;
      arms.forEach(a => {
        code += `    RobustDict({"id": "${FormattingUtil.escapeString(a.id)}", "name": "${FormattingUtil.escapeString(a.name)}", "ratio": ${a.ratio}}),\n`;
      });
      code += `]

ratio_multipliers = RobustDict({
`;
      for (const [aid, mult] of Object.entries(ratioMultipliers)) {
        code += `    "${FormattingUtil.escapeString(aid)}": ${mult},\n`;
      }
      code += `})

p_minimization = ${ir.minimizationP}
total_sample_size = ${config.minimizationConfig?.totalSampleSize || 100}
sites = [${(config.sites || []).map(s => `"${FormattingUtil.escapeString(s)}"`).join(', ')}]

# Caps
caps = RobustDict({
`;
      for (const [key, cap] of Object.entries(capsDict)) {
        code += `    "${FormattingUtil.escapeString(key)}": ${cap},\n`;
      }
      code += `})

active_pool = [
`;
      validPool.forEach(combo => {
        const elements = Object.keys(combo).map(k => `"${FormattingUtil.escapeString(k)}": "${FormattingUtil.escapeString(combo[k])}"`).join(', ');
        code += `    RobustDict({${elements}}),\n`;
      });
      code += `]

intersection_counts = RobustDict()

def get_rand():
    val = rng.random_int()
    return val / 4294967296.0

def sample_level(levels, expected_probs):
    explicit_sum = 0.0
    undefined_count = 0
    for p in expected_probs:
        if p is not None and p > 0:
            explicit_sum += p
        elif p is None:
            undefined_count += 1

    probs = [0] * len(expected_probs)
    if explicit_sum > 1.0 + PRECISION_EPSILON:
        for i, p in enumerate(expected_probs):
            probs[i] = round((p / explicit_sum) * PRECISION_SCALE) if (p is not None and p > 0) else 0
    elif abs(explicit_sum - 1.0) <= PRECISION_EPSILON:
        for i, p in enumerate(expected_probs):
            probs[i] = round(p * PRECISION_SCALE) if (p is not None and p > 0) else 0
    elif explicit_sum > PRECISION_EPSILON and explicit_sum < 1.0 - PRECISION_EPSILON:
        if undefined_count > 0:
            remainder = 1.0 - explicit_sum
            share = remainder / undefined_count
            for i, p in enumerate(expected_probs):
                probs[i] = round(p * PRECISION_SCALE) if (p is not None and p > 0) else (round(share * PRECISION_SCALE) if p is None else 0)
        else:
            for i, p in enumerate(expected_probs):
                probs[i] = round((p / explicit_sum) * PRECISION_SCALE) if (p is not None and p > 0) else 0
    else:
        share = 1.0 / len(levels)
        for i in range(len(levels)):
            probs[i] = round(share * PRECISION_SCALE)

    total_scaled = sum(probs)
    r = int(get_rand() * total_scaled)
    cumulative = 0
    for i, lvl in enumerate(levels):
        cumulative += probs[i]
        if r < cumulative:
            return lvl
    return levels[-1]

def select_weighted_arm(candidates):
    active_candidates = [a for a in candidates if a["ratio"] > 0]
    total_weight = sum(a["ratio"] for a in active_candidates)
    if total_weight == 0:
        raise ValueError("Total weight of tied arms is 0.")
    r_val = int(get_rand() * total_weight)
    for arm in active_candidates:
        r_val -= arm["ratio"]
        if r_val < 0:
            return arm
    return active_candidates[-1]

def get_intersection_key(stratum):
    keys = sorted(stratum.keys())
    for f in keys:
        if f not in strata:
            raise KeyException(f"Factor '{f}' not configured in trial schema.")
        if stratum[f] not in strata[f]["levels"]:
            raise KeyException(f"Level '{stratum[f]}' for factor '{f}' not configured in trial schema.")
    return "|".join(f"{k}:{stratum[k]}" for k in keys)

def can_add_subject(stratum):
    key = get_intersection_key(stratum)
    cap = caps.get(key)
    if cap is None: return True
    curr = intersection_counts.get(key, 0)
    return curr < cap

def register_subject(stratum):
    key = get_intersection_key(stratum)
    intersection_counts[key] = intersection_counts.get(key, 0) + 1

def validate_attributes(site, f, lvl, arm_id=None):
    if site not in sites:
        raise KeyException(f"Site '{site}' not configured in trial schema.")
    if f not in strata:
        raise KeyException(f"Factor '{f}' not configured in trial schema.")
    if lvl not in strata[f]["levels"]:
        raise KeyException(f"Level '{lvl}' for factor '{f}' not configured in trial schema.")
    if arm_id is not None and arm_id not in [a["id"] for a in arms]:
        raise KeyException(f"Arm '{arm_id}' not configured in trial schema.")

# Marginals initialized as nested RobustDicts
marginals = RobustDict()
for site in sites:
    marginals[site] = RobustDict()
    for f in strata:
        marginals[site][f] = RobustDict()
        for lvl in strata[f]["levels"]:
            marginals[site][f][lvl] = RobustDict()
            for arm in arms:
                marginals[site][f][lvl][arm['id']] = 0

def compute_imbalance_score(candidate_arm_id, site, subject_profile):
    total_score = 0
    active_arms = [a for a in arms if a["ratio"] > 0]
    for f in strata:
        lvl = subject_profile.get(f)
        if lvl is None: continue

        validate_attributes(site, f, lvl, candidate_arm_id)

        min_val = None
        max_val = None
        for arm in active_arms:
            arm_id = arm["id"]
            validate_attributes(site, f, lvl, arm_id)
            count = marginals[site][f][lvl][arm_id]
            if arm_id == candidate_arm_id:
                count += 1
            mult = ratio_multipliers[arm_id]
            normalized_count = count * mult
            if min_val is None or normalized_count < min_val: min_val = normalized_count
            if max_val is None or normalized_count > max_val: max_val = normalized_count
        if min_val is not None and max_val is not None:
            total_score += (max_val - min_val)
    return total_score

def format_stratum_code(subject_profile):
    parts = []
    for f in strata:
        val = subject_profile.get(f, "")
        if val.startswith(">=") or val.startswith("<=") or val.startswith(">") or val.startswith("<"):
            part = val.upper()
        else:
            part = val[:3].upper()
        parts.append(part)
    return "-".join(parts)

site_subject_counts = RobustDict({site: 0 for site in sites})
schema = []
seq_count = 0
audit_trail = []

# Main loop
for s_idx in range(total_sample_size):
    # Filter active pool
    valid_pool = [combo for combo in active_pool if can_add_subject(combo)]
    if not valid_pool:
        break

    # Select site uniformly
    site_idx = int(get_rand() * len(sites))
    site = sites[site_idx]

    subject_profile = RobustDict()
    valid_subject = True

    for f in strata:
        # Find active levels for this factor matching subject_profile prefix
        active_levels = set()
        for combo in valid_pool:
            match = True
            for prev_f in subject_profile:
                if combo[prev_f] != subject_profile[prev_f]:
                    match = False
                    break
            if match:
                active_levels.add(combo[f])

        available_levels = [lvl for lvl in strata[f]["levels"] if lvl in active_levels]
        expected_probs = []
        for lvl in available_levels:
            idx_lvl = strata[f]["levels"].index(lvl)
            expected_probs.append(strata[f]["expected_probs"][idx_lvl])

        if not available_levels:
            valid_subject = False
            break

        sampled_lvl = sample_level(available_levels, expected_probs)
        subject_profile[f] = sampled_lvl

    if not valid_subject:
        break

    # Explicit validation of generated subject attributes against trial schema
    if site not in sites:
        raise KeyException(f"Site '{site}' not configured in trial schema.")
    for f in subject_profile:
        validate_attributes(site, f, subject_profile[f])

    # Thread-safe critical section for marginal state lookup and update
    with lock:
        # Calculate imbalance scores
        active_arms = [a for a in arms if a["ratio"] > 0]
        arm_scores = []
        min_score = None
        for arm in active_arms:
            score = compute_imbalance_score(arm["id"], site, subject_profile)
            arm_scores.append(score)
            if min_score is None or score < min_score:
                min_score = score

        preferred = []
        non_preferred = []
        for i, arm in enumerate(active_arms):
            if arm_scores[i] == min_score:
                preferred.append(arm)
            else:
                non_preferred.append(arm)

        r = -1
        if len(preferred) == len(active_arms) or not non_preferred:
            assigned_arm = select_weighted_arm(preferred)
        else:
            r = int(get_rand() * PRECISION_SCALE)
            p_scaled = round(p_minimization * PRECISION_SCALE)
            if r < p_scaled:
                assigned_arm = select_weighted_arm(preferred)
            else:
                assigned_arm = select_weighted_arm(non_preferred)

        # Update marginals nested dictionaries safely
        for f in strata:
            lvl = subject_profile[f]
            validate_attributes(site, f, lvl, assigned_arm["id"])
            marginals[site][f][lvl][assigned_arm["id"]] += 1

        # Register subject
        register_subject(subject_profile)

        # Increment site subject counts
        site_subject_counts[site] += 1
        seq_count = site_subject_counts[site]

        stratum_code = format_stratum_code(subject_profile)

        # Generate Subject ID using tokens
`;
      const pythonIdLogic = CodeTranspiler.generateSubjectIdAndChecksumLogic('Python', ir.subjectIdTokens, 'site', 'stratum_code', 'seq_count');
      code += pythonIdLogic.replace(/^ {16}/gm, '        ');
      code += `
        row = {
            "SubjectID": subj_id,
            "Site": site,
            "Treatment": assigned_arm["name"],
            "BlockNumber": 0,
            "BlockSize": 0,
            "StratumCode": stratum_code
        }
        row.update(subject_profile)
        schema.append(row)

        arm_scores_str = "; ".join(f"{arm['name']}:{arm_scores[i]}" for i, arm in enumerate(active_arms))
        preferred_prob = "1.0" if (len(preferred) == len(active_arms) or not non_preferred) else str(p_minimization)
        rand_val_scaled = str(r / PRECISION_SCALE) if r >= 0 else "1.0"
        audit_row = {
            "SubjectID": subj_id,
            "Site": site,
            "StratumCode": stratum_code,
            "AllocatedArm": assigned_arm["name"],
            "ImbalanceScores": arm_scores_str,
            "PreferredArmProb": preferred_prob,
            "RandomValue": rand_val_scaled
        }
        audit_trail.append(audit_row)

if audit_trail:
    with open("audit_trail.csv", "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["SubjectID", "Site", "StratumCode", "AllocatedArm", "ImbalanceScores", "PreferredArmProb", "RandomValue"])
        writer.writeheader()
        writer.writerows(audit_trail)
`;
      return code;
    }

    if (language === 'R') {
      let code = `
# Strata configuration
strata <- list(
`;
      strata.forEach(f => {
        const levelsStr = f.levels.map(l => `"${FormattingUtil.escapeString(l)}"`).join(', ');
        const probsStr = f.levels.map(lvl => {
          const det = f.levelDetails?.find(d => d.name === lvl);
          return det && det.expectedProbability !== undefined ? det.expectedProbability : 'NA';
        }).join(', ');
        code += `  "${FormattingUtil.escapeString(f.id)}" = list(levels = c(${levelsStr}), expected_probs = c(${probsStr})),\n`;
      });
      code += `)

arms <- list(
`;
      arms.forEach(a => {
        code += `  list(id = "${FormattingUtil.escapeString(a.id)}", name = "${FormattingUtil.escapeString(a.name)}", ratio = ${a.ratio}),\n`;
      });
      code += `)

ratio_multipliers <- c(
`;
      for (const [aid, mult] of Object.entries(ratioMultipliers)) {
        code += `  "${FormattingUtil.escapeString(aid)}" = ${mult},\n`;
      }
      code += `)

p_minimization <- ${ir.minimizationP}
total_sample_size <- ${config.minimizationConfig?.totalSampleSize || 100}
sites <- c(${(config.sites || []).map(s => `"${FormattingUtil.escapeString(s)}"`).join(', ')})

# Caps
caps <- new.env(parent = emptyenv(), hash = TRUE)
`;
      for (const [key, cap] of Object.entries(capsDict)) {
        code += `caps[["${FormattingUtil.escapeString(key)}"]] <- ${cap}\n`;
      }
      code += `

active_pool <- list(
`;
      validPool.forEach(combo => {
        const elements = Object.keys(combo).map(k => `"${FormattingUtil.escapeString(k)}" = "${FormattingUtil.escapeString(combo[k])}"`).join(', ');
        code += `  list(${elements}),\n`;
      });
      code += `)

intersection_counts <- new.env(parent = emptyenv(), hash = TRUE)

sample_level <- function(levels, expected_probs) {
  explicit_sum <- 0
  undefined_count <- 0
  for (p in expected_probs) {
    if (!is.na(p) && p > 0) {
      explicit_sum <- explicit_sum + p
    } else if (is.na(p)) {
      undefined_count <- undefined_count + 1
    }
  }

  probs <- rep(0, length(expected_probs))
  if (explicit_sum > 1.0 + PRECISION_EPSILON) {
    for (i in seq_along(expected_probs)) {
      p <- expected_probs[i]
      probs[i] <- if (!is.na(p) && p > 0) round((p / explicit_sum) * PRECISION_SCALE) else 0
    }
  } else if (abs(explicit_sum - 1.0) <= PRECISION_EPSILON) {
    for (i in seq_along(expected_probs)) {
      p <- expected_probs[i]
      probs[i] <- if (!is.na(p) && p > 0) round(p * PRECISION_SCALE) else 0
    }
  } else if (explicit_sum > PRECISION_EPSILON && explicit_sum < 1.0 - PRECISION_EPSILON) {
    if (undefined_count > 0) {
      remainder <- 1.0 - explicit_sum
      share <- remainder / undefined_count
      for (i in seq_along(expected_probs)) {
        p <- expected_probs[i]
        probs[i] <- if (!is.na(p) && p > 0) round(p * PRECISION_SCALE) else (if (is.na(p)) round(share * PRECISION_SCALE) else 0)
      }
    } else {
      for (i in seq_along(expected_probs)) {
        p <- expected_probs[i]
        probs[i] <- if (!is.na(p) && p > 0) round((p / explicit_sum) * PRECISION_SCALE) else 0
      }
    }
  } else {
    share <- 1.0 / length(levels)
    for (i in seq_along(levels)) {
      probs[i] <- round(share * PRECISION_SCALE)
    }
  }

  total_scaled <- sum(probs)
  r <- floor((random_int() / 4294967296) * total_scaled)
  cumulative <- 0
  for (i in seq_along(levels)) {
    cumulative <- cumulative + probs[i]
    if (r < cumulative) return(levels[i])
  }
  return(levels[length(levels)])
}

select_weighted_arm <- function(candidates) {
  active_candidates <- Filter(function(a) a$ratio > 0, candidates)
  total_weight <- sum(sapply(active_candidates, function(a) a$ratio))
  if (total_weight == 0) {
    stop("Total weight of tied arms is 0.")
  }
  r_val <- floor((random_int() / 4294967296) * total_weight)
  for (arm in active_candidates) {
    r_val <- r_val - arm$ratio
    if (r_val < 0) {
      return(arm)
    }
  }
  return(active_candidates[[length(active_candidates)]])
}

get_safe_nested <- function(env, keys, error_msg) {
  curr <- env
  for (key in keys) {
    if (is.null(key) || is.na(key) || !exists(key, envir = curr, inherits = FALSE)) {
      stop(error_msg)
    }
    curr <- get(key, envir = curr, inherits = FALSE)
  }
  return(curr)
}

validate_attributes <- function(site, f, lvl, arm_id = NULL) {
  if (is.null(site) || is.na(site) || !(site %in% sites)) {
    stop(paste("Invalid or unconfigured site queried:", site))
  }
  if (is.null(f) || is.na(f) || !(f %in% names(strata))) {
    stop(paste("Invalid or unconfigured factor queried:", f))
  }
  if (is.null(lvl) || is.na(lvl) || !(lvl %in% strata[[f]]$levels)) {
    stop(paste("Invalid or unconfigured level queried:", lvl, "for factor:", f))
  }
  if (!is.null(arm_id)) {
    arm_ids <- sapply(arms, function(a) a$id)
    if (!(arm_id %in% arm_ids)) {
      stop(paste("Invalid or unconfigured treatment arm queried:", arm_id))
    }
  }
}

get_intersection_key <- function(stratum) {
  keys <- sort(names(stratum))
  for (f in keys) {
    if (!(f %in% names(strata))) {
      stop(paste("Factor not configured in schema:", f))
    }
    if (!(stratum[[f]] %in% strata[[f]]$levels)) {
      stop(paste("Level not configured in schema for factor", f, ":", stratum[[f]]))
    }
  }
  parts <- sapply(keys, function(k) paste0(k, ":", stratum[[k]]))
  paste(parts, collapse = "|")
}

can_add_subject <- function(stratum) {
  key <- get_intersection_key(stratum)
  cap <- if (exists(key, envir = caps, inherits = FALSE)) get(key, envir = caps, inherits = FALSE) else NULL
  if (is.null(cap)) return(TRUE)
  curr <- if (exists(key, envir = intersection_counts, inherits = FALSE)) get(key, envir = intersection_counts, inherits = FALSE) else 0
  return(curr < cap)
}

register_subject <- function(stratum) {
  key <- get_intersection_key(stratum)
  curr <- if (exists(key, envir = intersection_counts, inherits = FALSE)) get(key, envir = intersection_counts, inherits = FALSE) else 0
  intersection_counts[[key]] <- curr + 1
}

# Marginals initialized as nested environments
marginals <- new.env(parent = emptyenv(), hash = TRUE)
for (site in sites) {
  site_env <- new.env(parent = emptyenv(), hash = TRUE)
  for (f in names(strata)) {
    f_env <- new.env(parent = emptyenv(), hash = TRUE)
    for (lvl in strata[[f]]$levels) {
      lvl_env <- new.env(parent = emptyenv(), hash = TRUE)
      for (arm in arms) {
        lvl_env[[arm$id]] <- 0
      }
      f_env[[lvl]] <- lvl_env
    }
    site_env[[f]] <- f_env
  }
  marginals[[site]] <- site_env
}

compute_imbalance_score <- function(candidate_arm_id, site, subject_profile) {
  total_score <- 0
  active_arms <- Filter(function(a) a$ratio > 0, arms)
  for (f in names(strata)) {
    lvl <- subject_profile[[f]]
    if (is.null(lvl)) next

    validate_attributes(site, f, lvl, candidate_arm_id)

    min_val <- NULL
    max_val <- NULL
    for (arm in active_arms) {
      validate_attributes(site, f, lvl, arm$id)
      count <- get_safe_nested(marginals, c(site, f, lvl, arm$id), "Strata key not found")
      if (arm$id == candidate_arm_id) {
        count <- count + 1
      }
      mult <- ratio_multipliers[[arm$id]]
      if (is.na(mult)) {
        stop(paste("Invalid or unconfigured arm id in multipliers:", arm$id))
      }
      normalized_count <- count * mult
      if (is.null(min_val) || normalized_count < min_val) min_val <- normalized_count
      if (is.null(max_val) || normalized_count > max_val) max_val <- normalized_count
    }
    if (!is.null(min_val) && !is.null(max_val)) {
      total_score <- total_score + (max_val - min_val)
    }
  }
  return(total_score)
}

format_stratum_code <- function(stratum) {
  parts <- c()
  for (f in names(strata)) {
    val <- stratum[[f]]
    if (is.null(val)) val <- ""
    if (grepl("^[><=]", val)) {
      part <- toupper(val)
    } else {
      part <- toupper(substr(val, 1, 3))
    }
    parts <- c(parts, part)
  }
  paste(parts, collapse = "-")
}

site_subject_counts <- new.env(parent = emptyenv(), hash = TRUE)
for (site in sites) {
  site_subject_counts[[site]] <- 0
}

seq_count <- 0
audit_trail_list <- list()

# Main loop
for (s_idx in seq_len(total_sample_size)) {
  # Filter active pool
  valid_pool_indices <- c()
  for (i in seq_along(active_pool)) {
    if (can_add_subject(active_pool[[i]])) {
      valid_pool_indices <- c(valid_pool_indices, i)
    }
  }
  if (length(valid_pool_indices) == 0) {
    break
  }

  # Select site uniformly
  site_idx <- floor((random_int() / 4294967296) * length(sites)) + 1
  site <- sites[site_idx]
  if (!(site %in% sites)) stop(paste("Site not configured:", site))

  subject_profile <- list()
  valid_subject <- TRUE

  for (f in names(strata)) {
    # Find active levels for this factor matching subject_profile prefix
    active_levels <- c()
    for (idx in valid_pool_indices) {
      combo <- active_pool[[idx]]
      match <- TRUE
      for (prev_f in names(subject_profile)) {
        if (combo[[prev_f]] != subject_profile[[prev_f]]) {
          match <- FALSE
          break
        }
      }
      if (match) {
        active_levels <- unique(c(active_levels, combo[[f]]))
      }
    }

    available_levels <- c()
    expected_probs <- c()
    for (lvl in strata[[f]]$levels) {
      if (lvl %in% active_levels) {
        available_levels <- c(available_levels, lvl)
        idx_lvl <- which(strata[[f]]$levels == lvl)
        expected_probs <- c(expected_probs, strata[[f]]$expected_probs[idx_lvl])
      }
    }

    if (length(available_levels) == 0) {
      valid_subject <- FALSE
      break
    }

    sampled_lvl <- sample_level(available_levels, expected_probs)
    subject_profile[[f]] <- sampled_lvl
  }

  if (!valid_subject) {
    break
  }

  # Explicit validation of generated subject profile and site against schemas
  if (!(site %in% sites)) {
    stop(paste("Invalid or unconfigured site generated:", site))
  }
  for (f in names(subject_profile)) {
    validate_attributes(site, f, subject_profile[[f]])
  }

  # Calculate imbalance scores
  active_arms <- Filter(function(a) a$ratio > 0, arms)
  arm_scores <- c()
  min_score <- NULL
  for (i in seq_along(active_arms)) {
    score <- compute_imbalance_score(active_arms[[i]]$id, site, subject_profile)
    arm_scores <- c(arm_scores, score)
    if (is.null(min_score) || score < min_score) {
      min_score <- score
    }
  }

  preferred <- list()
  non_preferred <- list()
  for (i in seq_along(active_arms)) {
    if (arm_scores[i] == min_score) {
      preferred[[length(preferred) + 1]] <- active_arms[[i]]
    } else {
      non_preferred[[length(non_preferred) + 1]] <- active_arms[[i]]
    }
  }

  assigned_arm <- NULL
  r <- -1
  if (length(preferred) == length(active_arms) || length(non_preferred) == 0) {
    assigned_arm <- select_weighted_arm(preferred)
  } else {
    r <- floor((random_int() / 4294967296) * PRECISION_SCALE)
    p_scaled <- round(p_minimization * PRECISION_SCALE)
    if (r < p_scaled) {
      assigned_arm <- select_weighted_arm(preferred)
    } else {
      assigned_arm <- select_weighted_arm(non_preferred)
    }
  }

  # Update marginals nested environments safely
  for (f in names(strata)) {
    lvl <- subject_profile[[f]]
    validate_attributes(site, f, lvl, assigned_arm$id)
    lvl_env <- get_safe_nested(marginals, c(site, f, lvl), "Strata key not found")
    lvl_env[[assigned_arm$id]] <- lvl_env[[assigned_arm$id]] + 1
  }

  # Register subject
  register_subject(subject_profile)

  # Increment site subject counts
  site_subject_counts[[site]] <- site_subject_counts[[site]] + 1
  seq_count <- site_subject_counts[[site]]

  stratum_code <- format_stratum_code(subject_profile)

  # Generate Subject ID using tokens
`;
      const rIdLogic = CodeTranspiler.generateSubjectIdAndChecksumLogic('R', ir.subjectIdTokens, 'site', 'stratum_code', 'seq_count');
      code += rIdLogic.replace(/^ {8}/gm, '  ');
      code += `
  row_df <- data.frame(
    SubjectID = subj_id,
    Site = site,
    Treatment = assigned_arm$name,
    BlockNumber = 0,
    BlockSize = 0,
    StratumCode = stratum_code,
    stringsAsFactors = FALSE
  )
  for (f in names(strata)) {
    row_df[[f]] <- subject_profile[[f]]
  }
  schema_list[[length(schema_list) + 1]] <- row_df

  arm_scores_str <- paste(sapply(seq_along(active_arms), function(i) paste0(active_arms[[i]]$name, ":", arm_scores[i])), collapse="; ")
  preferred_prob <- if (length(preferred) == length(active_arms) || length(non_preferred) == 0) "1.0" else as.character(p_minimization)
  rand_val_scaled <- if (r >= 0) as.character(r / PRECISION_SCALE) else "1.0"
  audit_row <- data.frame(
    SubjectID = subj_id,
    Site = site,
    StratumCode = stratum_code,
    AllocatedArm = assigned_arm$name,
    ImbalanceScores = arm_scores_str,
    PreferredArmProb = preferred_prob,
    RandomValue = rand_val_scaled,
    stringsAsFactors = FALSE
  )
  audit_trail_list[[length(audit_trail_list) + 1]] <- audit_row
}

audit_trail_df <- do.call(rbind, audit_trail_list)
if (!is.null(audit_trail_df)) {
  write.csv(audit_trail_df, "audit_trail.csv", row.names = FALSE)
}
`;
      return code;
    }

    if (language === 'SAS') {
      const F = strata.length;
      const C = validPool.length;
      const A = arms.length;
      const S = config.sites?.length || 1;
      const L_max = Math.max(...strata.map(f => f.levels.length), 1);
      const C_dim = C > 0 ? C : 1;

      let code = `
  /* SAS Minimization State Arrays */
  array caps[${C_dim}] _temporary_ (${C > 0 ? validPool.map(combo => {
    const key = getIntersectionKey(combo);
    const cap = capsDict[key];
    return cap === undefined ? 99999999 : cap;
  }).join(' ') : '99999999'});
  array intersection_counts[${C_dim}] _temporary_ (${C_dim} * 0);

  array pool_levels[${C_dim}, ${F || 1}] _temporary_ (${C > 0 && F > 0 ? validPool.map(combo => {
    return strata.map(f => {
      const lvl = combo[f.id];
      return f.levels.indexOf(lvl) + 1;
    }).join(' ');
  }).join(' ') : '0'});

  array ratio_multipliers[${A}] _temporary_ (${arms.map(a => ratioMultipliers[a.id]).join(' ')});
  array arm_ratios[${A}] _temporary_ (${arms.map(a => a.ratio).join(' ')});
  array site_subject_counts[${S}] _temporary_ (${S} * 0);
  array subject_profile[${F || 1}] _temporary_;

  /* Helper values for sampling levels */
  array p_probs[${L_max}] _temporary_;
  array expected_probs[${L_max}] _temporary_;
  array active_levels_mask[${L_max}] _temporary_;
  array available_levels[${L_max}] _temporary_;

  array arm_scores[${A}] _temporary_;
  array preferred_arms[${A}] _temporary_;
  array non_preferred_arms[${A}] _temporary_;

  length ImbalanceScores $200 PreferredArmProb $10 RandomValue $20;
  length temp_arm_name $50 score_str $10;

  retain h_site_idx h_f_idx h_lvl_idx h_arm_idx h_count 0;

  if _N_ = 1 then do;
     declare hash marginals_hash();
     rc = marginals_hash.defineKey('h_site_idx', 'h_f_idx', 'h_lvl_idx', 'h_arm_idx');
     rc = marginals_hash.defineData('h_count');
     rc = marginals_hash.defineDone();
     call missing(h_site_idx, h_f_idx, h_lvl_idx, h_arm_idx, h_count);

     /* Pre-populate with 0s */
     do h_site_idx = 1 to ${S};
       do h_f_idx = 1 to ${F};
         do h_lvl_idx = 1 to ${L_max};
           do h_arm_idx = 1 to ${A};
             h_count = 0;
             rc = marginals_hash.add();
           end;
         end;
       end;
     end;
  end;
`;

      code += `
  do s_idx = 1 to ${config.minimizationConfig?.totalSampleSize || 100};
    /* 1. Check if active pool is exhausted */
    any_valid = 0;
    if ${C} > 0 then do;
      do c_idx = 1 to ${C};
        if intersection_counts[c_idx] < caps[c_idx] then do;
          any_valid = 1;
          leave;
        end;
      end;
    end;
    if any_valid = 0 then leave;

    /* 2. Select site uniformly */
    link get_rand_int;
    site_idx = int((rand_int / 4294967296) * ${S}) + 1;

    /* Map site_idx to site name */
    if 0 then;
`;
      (config.sites || []).forEach((site, sidx) => {
         code += `    else if site_idx = ${sidx + 1} then Site = "${FormattingUtil.escapeSasString(site)}";\n`;
      });

      code += `
    /* 3. Sample each factor sequentially */
    valid_subject = 1;

    do f_idx = 1 to ${F};
      /* Find active levels for this factor matching subject_profile prefix */
      do l_idx = 1 to ${L_max}; active_levels_mask[l_idx] = 0; end;

      if ${C} > 0 then do;
        do c_idx = 1 to ${C};
          if intersection_counts[c_idx] < caps[c_idx] then do;
            match = 1;
            do prev_f = 1 to (f_idx - 1);
              if pool_levels[c_idx, prev_f] ne subject_profile[prev_f] then do;
                match = 0;
                leave;
              end;
            end;
            if match = 1 then do;
              lvl_idx = pool_levels[c_idx, f_idx];
              active_levels_mask[lvl_idx] = 1;
            end;
          end;
        end;
      end;

      /* Build available levels list */
      num_available = 0;
`;
      strata.forEach((f, fidx) => {
        const numL = f.levels.length;
        const probs = f.levels.map(lvl => {
          const det = f.levelDetails?.find(d => d.name === lvl);
          return det && det.expectedProbability !== undefined ? det.expectedProbability : -1;
        });
        code += `      if f_idx = ${fidx + 1} then do;\n`;
        for (let l = 1; l <= numL; l++) {
          code += `        if active_levels_mask[${l}] = 1 then do;\n`;
          code += `          num_available = num_available + 1;\n`;
          code += `          available_levels[num_available] = ${l};\n`;
          code += `          expected_probs[num_available] = ${probs[l - 1]};\n`;
          code += `        end;\n`;
        }
        code += `      end;\n`;
      });

      code += `
      if num_available = 0 then do;
        valid_subject = 0;
        leave;
      end;

      /* sample_level on available levels */
      explicit_sum = 0.0;
      undefined_count = 0;
      do i = 1 to num_available;
        p = expected_probs[i];
        if p >= 0 then explicit_sum = explicit_sum + p;
        else undefined_count = undefined_count + 1;
      end;

      do i = 1 to num_available; p_probs[i] = 0; end;
      if explicit_sum > 1.0 + &PRECISION_EPSILON then do;
        do i = 1 to num_available;
          p = expected_probs[i];
          if p >= 0 then p_probs[i] = round((p / explicit_sum) * &PRECISION_SCALE);
        end;
      end;
      else if abs(explicit_sum - 1.0) <= &PRECISION_EPSILON then do;
        do i = 1 to num_available;
          p = expected_probs[i];
          if p >= 0 then p_probs[i] = round(p * &PRECISION_SCALE);
        end;
      end;
      else if explicit_sum > &PRECISION_EPSILON and explicit_sum < 1.0 - &PRECISION_EPSILON then do;
        if undefined_count > 0 then do;
          remainder = 1.0 - explicit_sum;
          share = remainder / undefined_count;
          do i = 1 to num_available;
            p = expected_probs[i];
            if p >= 0 then p_probs[i] = round(p * &PRECISION_SCALE);
            else p_probs[i] = round(share * &PRECISION_SCALE);
          end;
        end;
        else do;
          do i = 1 to num_available;
            p = expected_probs[i];
            if p >= 0 then p_probs[i] = round((p / explicit_sum) * &PRECISION_SCALE);
          end;
        end;
      end;
      else do;
        share = 1.0 / num_available;
        do i = 1 to num_available;
          p_probs[i] = round(share * &PRECISION_SCALE);
        end;
      end;

      total_scaled = 0;
      do i = 1 to num_available; total_scaled = total_scaled + p_probs[i]; end;

      link get_rand_int;
      r = int((rand_int / 4294967296) * total_scaled);
      cumulative = 0;
      sampled_idx = available_levels[num_available];
      do i = 1 to num_available;
        cumulative = cumulative + p_probs[i];
        if r < cumulative then do;
          sampled_idx = available_levels[i];
          leave;
        end;
      end;

      subject_profile[f_idx] = sampled_idx;
    end;

    if valid_subject = 0 then leave;

    /* 4. Calculate imbalance scores */
    min_score = 99999999;
    do arm_idx = 1 to ${A};
      if arm_ratios[arm_idx] > 0 then do;
        total_score = 0;
        do f_i = 1 to ${F};
          lvl_i = subject_profile[f_i];

          min_val = 99999999;
          max_val = -99999999;
          do a_i = 1 to ${A};
            if arm_ratios[a_i] > 0 then do;
              h_site_idx = site_idx;
              h_f_idx = f_i;
              h_lvl_idx = lvl_i;
              h_arm_idx = a_i;
              if h_site_idx < 1 or h_site_idx > ${S} or h_f_idx < 1 or h_f_idx > ${F} or h_lvl_idx < 1 or h_lvl_idx > ${L_max} or h_arm_idx < 1 or h_arm_idx > ${A} then do;
                 h_count = 0;
              end;
              else do;
                 rc = marginals_hash.find();
                 if rc ne 0 then h_count = 0;
              end;
              count = h_count;
              if a_i = arm_idx then count = count + 1;

              normalized_count = count * ratio_multipliers[a_i];
              if normalized_count < min_val then min_val = normalized_count;
              if normalized_count > max_val then max_val = normalized_count;
            end;
          end;
          total_score = total_score + (max_val - min_val);
        end;
        arm_scores[arm_idx] = total_score;
        if total_score < min_score then min_score = total_score;
      end;
    end;

    num_preferred = 0;
    num_non_preferred = 0;
    do arm_idx = 1 to ${A};
      if arm_ratios[arm_idx] > 0 then do;
        if arm_scores[arm_idx] = min_score then do;
          num_preferred = num_preferred + 1;
          preferred_arms[num_preferred] = arm_idx;
        end;
        else do;
          num_non_preferred = num_non_preferred + 1;
          non_preferred_arms[num_non_preferred] = arm_idx;
        end;
      end;
    end;

    r = -1;
    assigned_arm_idx = 1;
    if num_preferred = ${arms.filter(a => a.ratio > 0).length} or num_non_preferred = 0 then do;
      total_weight = 0;
      do i = 1 to num_preferred;
        total_weight = total_weight + arm_ratios[preferred_arms[i]];
      end;
      link get_rand_int;
      r_val = int((rand_int / 4294967296) * total_weight);
      assigned_arm_idx = preferred_arms[num_preferred];
      do i = 1 to num_preferred;
        r_val = r_val - arm_ratios[preferred_arms[i]];
        if r_val < 0 then do;
          assigned_arm_idx = preferred_arms[i];
          leave;
        end;
      end;
    end;
    else do;
      link get_rand_int;
      r = int((rand_int / 4294967296) * &PRECISION_SCALE);
      p_scaled = round(&p_minimization * &PRECISION_SCALE);
      if r < p_scaled then do;
        total_weight = 0;
        do i = 1 to num_preferred;
          total_weight = total_weight + arm_ratios[preferred_arms[i]];
        end;
        link get_rand_int;
        r_val = int((rand_int / 4294967296) * total_weight);
        assigned_arm_idx = preferred_arms[num_preferred];
        do i = 1 to num_preferred;
          r_val = r_val - arm_ratios[preferred_arms[i]];
          if r_val < 0 then do;
            assigned_arm_idx = preferred_arms[i];
            leave;
          end;
        end;
      end;
      else do;
        total_weight = 0;
        do i = 1 to num_non_preferred;
          total_weight = total_weight + arm_ratios[non_preferred_arms[i]];
        end;
        link get_rand_int;
        r_val = int((rand_int / 4294967296) * total_weight);
        assigned_arm_idx = non_preferred_arms[num_non_preferred];
        do i = 1 to num_non_preferred;
          r_val = r_val - arm_ratios[non_preferred_arms[i]];
          if r_val < 0 then do;
            assigned_arm_idx = non_preferred_arms[i];
            leave;
          end;
        end;
      end;
    end;

    if 0 then;
`;
      arms.forEach((a, armidx) => {
         code += `    else if assigned_arm_idx = ${armidx + 1} then Treatment = "${FormattingUtil.escapeSasString(a.name)}";\n`;
      });

      code += `
    /* Update marginals in Hash Object */
    do f_i = 1 to ${F};
      lvl_i = subject_profile[f_i];
      h_site_idx = site_idx;
      h_f_idx = f_i;
      h_lvl_idx = lvl_i;
      h_arm_idx = assigned_arm_idx;
      if h_site_idx >= 1 and h_site_idx <= ${S} and h_f_idx >= 1 and h_f_idx <= ${F} and h_lvl_idx >= 1 and h_lvl_idx <= ${L_max} and h_arm_idx >= 1 and h_arm_idx <= ${A} then do;
         rc = marginals_hash.find();
         if rc ne 0 then h_count = 0;
         h_count = h_count + 1;
         rc = marginals_hash.replace();
      end;
      else do;
         put "WARNING: Cleanly rejected out-of-bounds update: SiteIdx=" h_site_idx " FactorIdx=" h_f_idx " LevelIdx=" h_lvl_idx " ArmIdx=" h_arm_idx;
      end;
    end;

    /* Register subject */
    if ${C} > 0 then do;
      do c_idx = 1 to ${C};
        match = 1;
        do f_i = 1 to ${F};
          if pool_levels[c_idx, f_i] ne subject_profile[f_i] then do;
            match = 0;
            leave;
          end;
        end;
        if match = 1 then do;
          intersection_counts[c_idx] = intersection_counts[c_idx] + 1;
          leave;
        end;
      end;
    end;

    /* Increment site subject counts and get sequence */
    site_subject_counts[site_idx] = site_subject_counts[site_idx] + 1;
    seq_count = site_subject_counts[site_idx];

    /* Format stratum code and stratum values */
    StratumCode = "";
`;
      strata.forEach((f, fidx) => {
         code += `    if 0 then;\n`;
         f.levels.forEach((lvl, lvlidx) => {
            code += `    else if subject_profile[${fidx + 1}] = ${lvlidx + 1} then do;\n`;
            code += `      ${FormattingUtil.escapeSasString(f.id)} = "${FormattingUtil.escapeSasString(lvl)}";\n`;
            code += `      if index("${FormattingUtil.escapeSasString(lvl)}", ">=") = 1 or index("${FormattingUtil.escapeSasString(lvl)}", "<=") = 1 or index("${FormattingUtil.escapeSasString(lvl)}", ">") = 1 or index("${FormattingUtil.escapeSasString(lvl)}", "<") = 1 then part = upcase("${FormattingUtil.escapeSasString(lvl)}");\n`;
            code += `      else part = upcase(substr("${FormattingUtil.escapeSasString(lvl)}", 1, 3));\n`;
            code += `      if StratumCode = "" then StratumCode = part; else StratumCode = trim(StratumCode) || "-" || part;\n`;
            code += `    end;\n`;
         });
      });

      code += `
    BlockNumber = 0;
    BlockSize = 0;

    /* Generate Subject ID using tokens */
`;
      code += CodeTranspiler.generateSubjectIdAndChecksumLogic('SAS', ir.subjectIdTokens, 'Site', 'StratumCode', 'seq_count');
      
      let armNamesMapping = '';
      arms.forEach((arm, armidx) => {
        armNamesMapping += `      else if a_idx = ${armidx + 1} then temp_arm_name = "${FormattingUtil.escapeSasString(arm.name)}";\n`;
      });

      code += `
    output;

    if s_idx = 1 then do;
      file "audit_trail.csv" dsd dlm=",";
      put "SubjectID" "," "Site" "," "StratumCode" "," "AllocatedArm" "," "ImbalanceScores" "," "PreferredArmProb" "," "RandomValue";
    end;

    ImbalanceScores = "";
    do a_idx = 1 to ${A};
      if 0 then;
${armNamesMapping}
      score_str = put(arm_scores[a_idx], 8.);
      if ImbalanceScores = "" then ImbalanceScores = trim(temp_arm_name) || ":" || trim(left(score_str));
      else ImbalanceScores = trim(ImbalanceScores) || "; " || trim(temp_arm_name) || ":" || trim(left(score_str));
    end;

    if num_preferred = ${arms.filter(a => a.ratio > 0).length} or num_non_preferred = 0 then PreferredArmProb = "1.0";
    else PreferredArmProb = put(&p_minimization, 8.4);

    if r < 0 then RandomValue = "1.0";
    else RandomValue = put(r / &PRECISION_SCALE, 12.8);

    file "audit_trail.csv" dsd dlm=",";
    put SubjectID Site StratumCode Treatment ImbalanceScores PreferredArmProb RandomValue;
    file log;
  end;

  drop h_site_idx h_f_idx h_lvl_idx h_arm_idx h_count rc;
`;
      return code;
    }

    if (language === 'STATA') {
      const F = strata.length;
      const C = validPool.length;

      let code = `
  // Stata Minimization State
  sites = (${(config.sites || []).map(s => `"${FormattingUtil.escapeSasString(s)}"`).join(',')})
  arms = (${arms.map(a => `"${FormattingUtil.escapeSasString(a.name)}"`).join(',')})
  arm_ids = (${arms.map(a => `"${FormattingUtil.escapeSasString(a.id)}"`).join(',')})
  arm_ratios = (${arms.map(a => a.ratio).join(',')})
  ratio_multipliers = asarray_create("string")
`;
      for (const [aid, mult] of Object.entries(ratioMultipliers)) {
        code += `  asarray(ratio_multipliers, "${FormattingUtil.escapeSasString(aid)}", ${mult})\n`;
      }

      code += `
  p_minimization = ${ir.minimizationP}
  total_sample_size = ${config.minimizationConfig?.totalSampleSize || 100}

  caps = asarray_create("string")
`;
      for (const [key, cap] of Object.entries(capsDict)) {
        code += `  asarray(caps, "${FormattingUtil.escapeSasString(key)}", ${cap})\n`;
      }

      code += `
  active_pool = J(${C}, ${F || 1}, "")
`;
      validPool.forEach((combo, cidx) => {
         strata.forEach((f, fidx) => {
            code += `  active_pool[${cidx + 1}, ${fidx + 1}] = "${FormattingUtil.escapeSasString(combo[f.id])}"\n`;
         });
      });

      code += `
  intersection_counts = asarray_create("string")

  // Marginals initialized to 0
  marginals = asarray_create("string")
  for (site_i=1; site_i<=cols(sites); site_i++) {
    for (f_i=1; f_i<=${F}; f_i++) {
`;
      strata.forEach((f, fidx) => {
         code += `      if (f_i == ${fidx + 1}) {\n`;
         f.levels.forEach(lvl => {
            code += `        for (a_i=1; a_i<=cols(arms); a_i++) {\n`;
            code += `          asarray(marginals, sites[site_i] + "|" + strofreal(f_i) + "|${FormattingUtil.escapeSasString(lvl)}|" + arm_ids[a_i], 0)\n`;
            code += `        }\n`;
         });
         code += `      }\n`;
      });
      code += `    }
  }

  real scalar sample_level(string rowvector levels, real rowvector expected_probs) {
    real scalar explicit_sum, undefined_count, i, total_scaled, r, cumulative
    real rowvector probs

    explicit_sum = 0
    undefined_count = 0
    for (i=1; i<=cols(expected_probs); i++) {
      if (expected_probs[i] >= 0) {
        explicit_sum = explicit_sum + expected_probs[i]
      } else {
        undefined_count = undefined_count + 1
      }
    }

    probs = J(1, cols(expected_probs), 0)
    if (explicit_sum > 1.0 + ${PRECISION_EPSILON}) {
      for (i=1; i<=cols(expected_probs); i++) {
        if (expected_probs[i] >= 0) probs[i] = round((expected_probs[i] / explicit_sum) * ${PRECISION_SCALE})
      }
    } else if (abs(explicit_sum - 1.0) <= ${PRECISION_EPSILON}) {
      for (i=1; i<=cols(expected_probs); i++) {
        if (expected_probs[i] >= 0) probs[i] = round(expected_probs[i] * ${PRECISION_SCALE})
      }
    } else if (explicit_sum > ${PRECISION_EPSILON} & explicit_sum < 1.0 - ${PRECISION_EPSILON}) {
      if (undefined_count > 0) {
        remainder = 1.0 - explicit_sum
        share = remainder / undefined_count
        for (i=1; i<=cols(expected_probs); i++) {
          if (expected_probs[i] >= 0) probs[i] = round(expected_probs[i] * ${PRECISION_SCALE})
          else probs[i] = round(share * ${PRECISION_SCALE})
        }
      } else {
        for (i=1; i<=cols(expected_probs); i++) {
          if (expected_probs[i] >= 0) probs[i] = round((expected_probs[i] / explicit_sum) * ${PRECISION_SCALE})
        }
      }
    } else {
      share = 1.0 / cols(levels)
      for (i=1; i<=cols(levels); i++) {
        probs[i] = round(share * ${PRECISION_SCALE})
      }
    }

    total_scaled = sum(probs)
    r = trunc((random_int() / 4294967296) * total_scaled)
    cumulative = 0
    for (i=1; i<=cols(levels); i++) {
      cumulative = cumulative + probs[i]
      if (r < cumulative) return(i)
    }
    return(cols(levels))
  }

  real scalar select_weighted_arm(real rowvector candidates_indices) {
    real scalar total_weight, i, r_val, arm_idx
    real rowvector active_candidates
    active_candidates = J(1, 0, 0)
    for (i=1; i<=cols(candidates_indices); i++) {
      if (arm_ratios[candidates_indices[i]] > 0) {
        active_candidates = active_candidates, candidates_indices[i]
      }
    }
    total_weight = 0
    for (i=1; i<=cols(active_candidates); i++) {
      total_weight = total_weight + arm_ratios[active_candidates[i]]
    }
    if (total_weight == 0) {
      exit(error(119))
    }
    r_val = trunc((random_int() / 4294967296) * total_weight)
    for (i=1; i<=cols(active_candidates); i++) {
      arm_idx = active_candidates[i]
      r_val = r_val - arm_ratios[arm_idx]
      if (r_val < 0) return(arm_idx)
    }
    return(active_candidates[cols(active_candidates)])
  }

  string scalar get_intersection_key(string rowvector stratum) {
    real rowvector perm
    string rowvector sorted_stratum, sorted_keys, parts
    real scalar i
    string rowvector keys
    keys = (${strata.map(f => `"${FormattingUtil.escapeSasString(f.id)}"`).join(',')})
    perm = order(keys', 1)
    sorted_keys = keys[perm]
    sorted_stratum = stratum[perm]

    parts = J(1, cols(keys), "")
    for (i=1; i<=cols(keys); i++) {
      parts[i] = sorted_keys[i] + ":" + sorted_stratum[i]
    }
    return(invtokens(parts, "|"))
  }

  real scalar can_add_subject(string rowvector stratum) {
    string scalar key
    real scalar cap, curr
    key = get_intersection_key(stratum)
    if (asarray_contains(caps, key)) {
      cap = asarray(caps, key)
    } else {
      return(1)
    }
    curr = 0
    if (asarray_contains(intersection_counts, key)) {
      curr = asarray(intersection_counts, key)
    }
    return(curr < cap)
  }

  void register_subject(string rowvector stratum) {
    string scalar key
    real scalar curr
    key = get_intersection_key(stratum)
    curr = 0
    if (asarray_contains(intersection_counts, key)) {
      curr = asarray(intersection_counts, key)
    }
    asarray(intersection_counts, key, curr + 1)
  }

  real scalar compute_imbalance_score(real scalar candidate_arm_idx, string scalar site, string rowvector subject_profile) {
    real scalar total_score, f_idx, min_val, max_val, a_idx, count, normalized_count
    string scalar lvl, key

    total_score = 0
    for (f_idx=1; f_idx<=${F}; f_idx++) {
      lvl = subject_profile[f_idx]
      min_val = .
      max_val = .
      for (a_idx=1; a_idx<=cols(arms); a_idx++) {
        if (arm_ratios[a_idx] > 0) {
          key = site + "|" + strofreal(f_idx) + "|" + lvl + "|" + arm_ids[a_idx]
          count = asarray(marginals, key)
          if (a_idx == candidate_arm_idx) {
            count = count + 1
          }
          normalized_count = count * asarray(ratio_multipliers, arm_ids[a_idx])
          if (min_val == . | normalized_count < min_val) min_val = normalized_count
          if (max_val == . | normalized_count > max_val) max_val = normalized_count
        }
      }
      if (min_val != . & max_val != .) {
        total_score = total_score + (max_val - min_val)
      }
    }
    return(total_score)
  }

  string scalar format_stratum_code(string rowvector stratum) {
    string rowvector parts
    real scalar i
    string scalar val, part
    parts = J(1, cols(stratum), "")
    for (i=1; i<=cols(stratum); i++) {
      val = stratum[i]
      if (substr(val, 1, 2) == ">=" | substr(val, 1, 2) == "<=" | substr(val, 1, 1) == ">" | substr(val, 1, 1) == "<") {
        part = toupper(val)
      } else {
        part = toupper(substr(val, 1, 3))
      }
      parts[i] = part
    }
    return(invtokens(parts, "-"))
  }

  site_subject_counts = asarray_create("string")
  for (i=1; i<=cols(sites); i++) {
    asarray(site_subject_counts, sites[i], 0)
  }

  schema_out = J(0, ${6 + F}, "")
  audit_out = J(0, 7, "")
  seq_count = 0

  for (s_idx=1; s_idx<=total_sample_size; s_idx++) {
    valid_pool_indices = J(1, 0, 0)
    for (i=1; i<=rows(active_pool); i++) {
      if (can_add_subject(active_pool[i, .])) {
        valid_pool_indices = valid_pool_indices, i
      }
    }
    if (cols(valid_pool_indices) == 0) {
      break
    }

    site_idx = trunc((random_int() / 4294967296) * cols(sites)) + 1
    site = sites[site_idx]

    subject_profile = J(1, ${F || 1}, "")
    valid_subject = 1

    for (f_idx=1; f_idx<=${F}; f_idx++) {
      active_levels = J(1, 0, "")
      for (i=1; i<=cols(valid_pool_indices); i++) {
        c_idx = valid_pool_indices[i]
        match = 1
        for (prev_f=1; prev_f<=(f_idx-1); prev_f++) {
          if (active_pool[c_idx, prev_f] != subject_profile[prev_f]) {
            match = 0
            break
          }
        }
        if (match) {
          active_levels = active_levels, active_pool[c_idx, f_idx]
        }
      }

      string rowvector available_lvls
      real rowvector expected_probs
      available_lvls = J(1, 0, "")
      expected_probs = J(1, 0, 0)
`;
      strata.forEach((f, fidx) => {
         code += `      if (f_idx == ${fidx + 1}) {\n`;
         f.levels.forEach(lvl => {
            const det = f.levelDetails?.find(d => d.name === lvl);
            const prob = det && det.expectedProbability !== undefined ? det.expectedProbability : -1;
            code += `        has_lvl = 0\n`;
            code += `        for (k=1; k<=cols(active_levels); k++) {\n`;
            code += `          if (active_levels[k] == "${FormattingUtil.escapeSasString(lvl)}") { has_lvl = 1; break; }\n`;
            code += `        }\n`;
            code += `        if (has_lvl) {\n`;
            code += `          available_lvls = available_lvls, "${FormattingUtil.escapeSasString(lvl)}"\n`;
            code += `          expected_probs = expected_probs, ${prob}\n`;
            code += `        }\n`;
         });
         code += `      }\n`;
      });

      code += `
      if (cols(available_lvls) == 0) {
        valid_subject = 0
        break
      }

      sampled_lvl_idx = sample_level(available_lvls, expected_probs)
      subject_profile[f_idx] = available_lvls[sampled_lvl_idx]
    }

    if (valid_subject == 0) {
      break
    }

    active_arm_indices = J(1, 0, 0)
    for (a_i=1; a_i<=cols(arms); a_i++) {
      if (arm_ratios[a_i] > 0) active_arm_indices = active_arm_indices, a_i
    }

    arm_scores = J(1, cols(arms), 0)
    min_score = .
    for (i=1; i<=cols(active_arm_indices); i++) {
      arm_idx = active_arm_indices[i]
      score = compute_imbalance_score(arm_idx, site, subject_profile)
      arm_scores[arm_idx] = score
      if (min_score == . | score < min_score) {
        min_score = score
      }
    }

    preferred_indices = J(1, 0, 0)
    non_preferred_indices = J(1, 0, 0)
    for (i=1; i<=cols(active_arm_indices); i++) {
      arm_idx = active_arm_indices[i]
      if (arm_scores[arm_idx] == min_score) {
        preferred_indices = preferred_indices, arm_idx
      } else {
        non_preferred_indices = non_preferred_indices, arm_idx
      }
    }

    r = -1
    if (cols(preferred_indices) == cols(active_arm_indices) | cols(non_preferred_indices) == 0) {
      assigned_arm_idx = select_weighted_arm(preferred_indices)
    } else {
      r = trunc((random_int() / 4294967296) * ${PRECISION_SCALE})
      p_scaled = round(p_minimization * ${PRECISION_SCALE})
      if (r < p_scaled) {
        assigned_arm_idx = select_weighted_arm(preferred_indices)
      } else {
        assigned_arm_idx = select_weighted_arm(non_preferred_indices)
      }
    }

    for (f_idx=1; f_idx<=${F}; f_idx++) {
      lvl = subject_profile[f_idx]
      key = site + "|" + strofreal(f_idx) + "|" + lvl + "|" + arm_ids[assigned_arm_idx]
      asarray(marginals, key, asarray(marginals, key) + 1)
    }

    register_subject(subject_profile)

    seq_count = asarray(site_subject_counts, site) + 1
    asarray(site_subject_counts, site, seq_count)

    stratum_code = format_stratum_code(subject_profile)

`;
      const stataIdLogic = CodeTranspiler.generateSubjectIdAndChecksumLogic('STATA', ir.subjectIdTokens, 'site', 'stratum_code', 'seq_count');
      code += stataIdLogic;
      code += `
    row_res = (subj_id, site, arms[assigned_arm_idx], "0", "0", stratum_code)
    if (cols(subject_profile) > 0) {
      row_res = row_res, subject_profile
    }
    schema_out = schema_out \\ row_res

    imbalance_scores_str = ""
    for (arm_i=1; arm_i<=cols(active_arm_indices); arm_i++) {
      arm_idx = active_arm_indices[arm_i]
      score_val = arm_scores[arm_idx]
      arm_name = arms[arm_idx]
      if (imbalance_scores_str == "") {
        imbalance_scores_str = arm_name + ":" + strofreal(score_val)
      } else {
        imbalance_scores_str = imbalance_scores_str + "; " + arm_name + ":" + strofreal(score_val)
      }
    }
    
    pref_prob_str = "1.0"
    if (cols(preferred_indices) != cols(active_arm_indices) & cols(non_preferred_indices) > 0) {
      pref_prob_str = strofreal(p_minimization)
    }
    
    rand_val_str = "1.0"
    if (r >= 0) {
      rand_val_str = strofreal(r / ${PRECISION_SCALE})
    }

    audit_row = (subj_id, site, stratum_code, arms[assigned_arm_idx], imbalance_scores_str, pref_prob_str, rand_val_str)
    audit_out = audit_out \\ audit_row
  }

  if (rows(audit_out) > 0) {
    fh = fopen("audit_trail.csv", "w")
    fput(fh, "SubjectID,Site,StratumCode,AllocatedArm,ImbalanceScores,PreferredArmProb,RandomValue")
    for (i=1; i<=rows(audit_out); i++) {
      fput(fh, audit_out[i, 1] + "," + audit_out[i, 2] + "," + audit_out[i, 3] + "," + audit_out[i, 4] + ',"' + audit_out[i, 5] + '",' + audit_out[i, 6] + "," + audit_out[i, 7])
    }
    fclose(fh)
  }
`;
      return code;
    }

    return '';
  }
}
