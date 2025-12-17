"""
Evals Framework for MANOE - LLM-as-Judge Evaluation

This module implements Evaluation Driven Development where:
- LLM judges evaluate generated content quality
- Test datasets define "ideal" outputs
- Metrics track Coherence, Style, Instruction Following
- CI integration fails PRs if quality drops

Key concepts:
- EvalCriteria: Defines what to evaluate (coherence, style, etc.)
- EvalResult: Result from an evaluation
- EvalDataset: Collection of test cases
- LLMJudge: Uses GPT-4 or similar to evaluate outputs
"""

import json
import time
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Dict, List, Optional


class EvalCriterion(str, Enum):
    """Evaluation criteria for generated content."""
    COHERENCE = "coherence"  # Logical flow and consistency
    STYLE = "style"  # Writing quality and voice
    INSTRUCTION_FOLLOWING = "instruction_following"  # Adherence to prompts
    CHARACTER_CONSISTENCY = "character_consistency"  # Character voice/behavior
    WORLD_CONSISTENCY = "world_consistency"  # World rules adherence
    EMOTIONAL_IMPACT = "emotional_impact"  # Reader engagement
    ORIGINALITY = "originality"  # Creativity and uniqueness
    PACING = "pacing"  # Story rhythm and flow


@dataclass
class EvalCriteria:
    """Configuration for an evaluation criterion."""
    criterion: EvalCriterion
    weight: float = 1.0  # Weight in overall score
    threshold: float = 7.0  # Minimum acceptable score
    description: str = ""
    rubric: str = ""  # Detailed scoring rubric


@dataclass
class EvalResult:
    """Result from evaluating a single criterion."""
    criterion: EvalCriterion
    score: float  # 0-10 scale
    feedback: str
    passed: bool
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class EvalReport:
    """Complete evaluation report for a piece of content."""
    content_id: str
    content_type: str  # "scene", "character", "outline", etc.
    overall_score: float
    passed: bool
    results: List[EvalResult] = field(default_factory=list)
    timestamp: datetime = field(default_factory=datetime.utcnow)
    latency_ms: float = 0
    judge_model: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for storage."""
        return {
            "content_id": self.content_id,
            "content_type": self.content_type,
            "overall_score": self.overall_score,
            "passed": self.passed,
            "results": [
                {
                    "criterion": r.criterion.value,
                    "score": r.score,
                    "feedback": r.feedback,
                    "passed": r.passed,
                    "metadata": r.metadata,
                }
                for r in self.results
            ],
            "timestamp": self.timestamp.isoformat(),
            "latency_ms": self.latency_ms,
            "judge_model": self.judge_model,
            "metadata": self.metadata,
        }


@dataclass
class TestCase:
    """A test case for evaluation."""
    id: str
    name: str
    input_data: Dict[str, Any]  # Input to the generation
    expected_output: Optional[str] = None  # Reference output (if available)
    criteria: List[EvalCriterion] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class EvalDataset:
    """Collection of test cases for evaluation."""
    name: str
    description: str
    test_cases: List[TestCase] = field(default_factory=list)
    version: str = "1.0"
    
    def add_case(self, case: TestCase) -> None:
        """Add a test case to the dataset."""
        self.test_cases.append(case)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for storage."""
        return {
            "name": self.name,
            "description": self.description,
            "version": self.version,
            "test_cases": [
                {
                    "id": tc.id,
                    "name": tc.name,
                    "input_data": tc.input_data,
                    "expected_output": tc.expected_output,
                    "criteria": [c.value for c in tc.criteria],
                    "metadata": tc.metadata,
                }
                for tc in self.test_cases
            ],
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "EvalDataset":
        """Create from dictionary."""
        dataset = cls(
            name=data["name"],
            description=data["description"],
            version=data.get("version", "1.0"),
        )
        for tc_data in data.get("test_cases", []):
            dataset.add_case(TestCase(
                id=tc_data["id"],
                name=tc_data["name"],
                input_data=tc_data["input_data"],
                expected_output=tc_data.get("expected_output"),
                criteria=[EvalCriterion(c) for c in tc_data.get("criteria", [])],
                metadata=tc_data.get("metadata", {}),
            ))
        return dataset


class LLMJudge:
    """
    LLM-based judge for evaluating generated content.
    
    Uses a powerful LLM (e.g., GPT-4) to evaluate outputs against
    defined criteria and rubrics.
    """
    
    DEFAULT_CRITERIA = [
        EvalCriteria(
            criterion=EvalCriterion.COHERENCE,
            weight=1.5,
            threshold=7.0,
            description="Logical flow, consistency, and clarity of the narrative",
            rubric="""
            10: Flawless logical flow, perfect consistency, crystal clear
            8-9: Strong coherence with minor issues
            6-7: Generally coherent but some confusing passages
            4-5: Noticeable coherence problems affecting readability
            1-3: Significant coherence issues, hard to follow
            """,
        ),
        EvalCriteria(
            criterion=EvalCriterion.STYLE,
            weight=1.0,
            threshold=7.0,
            description="Writing quality, voice consistency, and prose style",
            rubric="""
            10: Exceptional prose, distinctive voice, masterful style
            8-9: Strong writing with consistent voice
            6-7: Competent writing, occasional style inconsistencies
            4-5: Adequate but unremarkable prose
            1-3: Poor writing quality, inconsistent voice
            """,
        ),
        EvalCriteria(
            criterion=EvalCriterion.INSTRUCTION_FOLLOWING,
            weight=1.5,
            threshold=7.0,
            description="Adherence to the given instructions and constraints",
            rubric="""
            10: Perfectly follows all instructions and constraints
            8-9: Follows most instructions with minor deviations
            6-7: Generally follows instructions but misses some details
            4-5: Partial adherence to instructions
            1-3: Largely ignores or misinterprets instructions
            """,
        ),
        EvalCriteria(
            criterion=EvalCriterion.CHARACTER_CONSISTENCY,
            weight=1.0,
            threshold=6.5,
            description="Characters behave consistently with their established traits",
            rubric="""
            10: Characters perfectly consistent, distinct voices
            8-9: Strong character consistency with minor slips
            6-7: Generally consistent but some out-of-character moments
            4-5: Noticeable character inconsistencies
            1-3: Characters behave erratically or generically
            """,
        ),
        EvalCriteria(
            criterion=EvalCriterion.EMOTIONAL_IMPACT,
            weight=0.8,
            threshold=6.0,
            description="Emotional resonance and reader engagement",
            rubric="""
            10: Deeply moving, unforgettable emotional impact
            8-9: Strong emotional engagement
            6-7: Some emotional moments but not consistently engaging
            4-5: Limited emotional resonance
            1-3: Emotionally flat or disconnected
            """,
        ),
    ]
    
    def __init__(
        self,
        model_client: Any = None,
        judge_model: str = "gpt-4o",
        judge_provider: str = "openai",
        criteria: Optional[List[EvalCriteria]] = None,
    ):
        self.model_client = model_client
        self.judge_model = judge_model
        self.judge_provider = judge_provider
        self.criteria = criteria or self.DEFAULT_CRITERIA
    
    def _build_eval_prompt(
        self,
        content: str,
        content_type: str,
        criteria: List[EvalCriteria],
        context: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Build the evaluation prompt for the judge."""
        criteria_text = "\n\n".join([
            f"## {c.criterion.value.upper()}\n"
            f"Description: {c.description}\n"
            f"Rubric:\n{c.rubric}"
            for c in criteria
        ])
        
        context_text = ""
        if context:
            context_text = f"\n\nCONTEXT:\n{json.dumps(context, indent=2)}"
        
        return f"""You are an expert literary critic and writing evaluator. Your task is to evaluate the following {content_type} based on specific criteria.

CONTENT TO EVALUATE:
---
{content}
---
{context_text}

EVALUATION CRITERIA:
{criteria_text}

INSTRUCTIONS:
1. Evaluate the content against each criterion
2. Provide a score from 0-10 for each criterion
3. Provide specific, actionable feedback for each criterion
4. Be objective and consistent in your scoring

Respond in JSON format:
{{
    "evaluations": [
        {{
            "criterion": "<criterion_name>",
            "score": <0-10>,
            "feedback": "<specific feedback>"
        }}
    ],
    "overall_feedback": "<summary of strengths and areas for improvement>"
}}
"""
    
    async def evaluate(
        self,
        content: str,
        content_type: str = "scene",
        content_id: str = "",
        criteria: Optional[List[EvalCriteria]] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> EvalReport:
        """
        Evaluate content using the LLM judge.
        
        Args:
            content: The content to evaluate
            content_type: Type of content (scene, character, outline)
            content_id: Identifier for the content
            criteria: Criteria to evaluate (uses defaults if None)
            context: Additional context for evaluation
            
        Returns:
            EvalReport with scores and feedback
        """
        start_time = time.time()
        eval_criteria = criteria or self.criteria
        
        # Build the evaluation prompt
        prompt = self._build_eval_prompt(content, content_type, eval_criteria, context)
        
        # Call the judge model
        if self.model_client:
            try:
                from config import LLMProvider
                
                response = await self.model_client.create_chat_completion(
                    messages=[
                        {"role": "system", "content": "You are an expert literary evaluator."},
                        {"role": "user", "content": prompt},
                    ],
                    model=self.judge_model,
                    provider=LLMProvider(self.judge_provider),
                    temperature=0.3,  # Lower temperature for consistent evaluation
                    response_format={"type": "json_object"},
                )
                
                # Parse the response
                eval_data = json.loads(response.content)
                
            except Exception as e:
                # Return a failed evaluation
                return EvalReport(
                    content_id=content_id,
                    content_type=content_type,
                    overall_score=0,
                    passed=False,
                    judge_model=self.judge_model,
                    latency_ms=(time.time() - start_time) * 1000,
                    metadata={"error": str(e)},
                )
        else:
            # Mock evaluation for testing without model client
            eval_data = self._mock_evaluation(eval_criteria)
        
        # Process evaluation results
        results: List[EvalResult] = []
        total_weighted_score: float = 0.0
        total_weight: float = 0.0
        all_passed = True
        
        criteria_map = {c.criterion.value: c for c in eval_criteria}
        
        for eval_item in eval_data.get("evaluations", []):
            criterion_name = eval_item.get("criterion", "")
            score = float(eval_item.get("score", 0))
            feedback = eval_item.get("feedback", "")
            
            criterion_config = criteria_map.get(criterion_name)
            if criterion_config:
                passed = score >= criterion_config.threshold
                weight = criterion_config.weight
            else:
                passed = score >= 7.0
                weight = 1.0
            
            if not passed:
                all_passed = False
            
            total_weighted_score += score * weight
            total_weight += weight
            
            try:
                criterion_enum = EvalCriterion(criterion_name)
            except ValueError:
                criterion_enum = EvalCriterion.COHERENCE
            
            results.append(EvalResult(
                criterion=criterion_enum,
                score=score,
                feedback=feedback,
                passed=passed,
            ))
        
        overall_score = total_weighted_score / total_weight if total_weight > 0 else 0
        
        return EvalReport(
            content_id=content_id,
            content_type=content_type,
            overall_score=round(overall_score, 2),
            passed=all_passed,
            results=results,
            judge_model=self.judge_model,
            latency_ms=(time.time() - start_time) * 1000,
            metadata={"overall_feedback": eval_data.get("overall_feedback", "")},
        )
    
    def _mock_evaluation(self, criteria: List[EvalCriteria]) -> Dict[str, Any]:
        """Generate mock evaluation for testing."""
        return {
            "evaluations": [
                {
                    "criterion": c.criterion.value,
                    "score": 7.5,
                    "feedback": f"Mock feedback for {c.criterion.value}",
                }
                for c in criteria
            ],
            "overall_feedback": "Mock overall feedback",
        }


class EvalRunner:
    """
    Runs evaluations against a dataset and tracks results.
    
    Used for:
    - Running test suites before deployment
    - CI/CD quality gates
    - Regression testing after prompt changes
    """
    
    def __init__(
        self,
        judge: LLMJudge,
        baseline_scores: Optional[Dict[str, float]] = None,
        regression_threshold: float = 0.05,  # 5% quality drop threshold
    ):
        self.judge = judge
        self.baseline_scores = baseline_scores or {}
        self.regression_threshold = regression_threshold
        self.results: List[EvalReport] = []
    
    async def run_dataset(
        self,
        dataset: EvalDataset,
        generator: Callable[[Dict[str, Any]], str],
    ) -> Dict[str, Any]:
        """
        Run evaluation on a dataset.
        
        Args:
            dataset: Test dataset to evaluate
            generator: Function that generates content from input
            
        Returns:
            Summary of evaluation results
        """
        self.results = []
        
        for test_case in dataset.test_cases:
            # Generate content
            content = generator(test_case.input_data)
            
            # Evaluate
            criteria = [
                c for c in self.judge.criteria
                if not test_case.criteria or c.criterion in test_case.criteria
            ]
            
            report = await self.judge.evaluate(
                content=content,
                content_type=test_case.metadata.get("content_type", "scene"),
                content_id=test_case.id,
                criteria=criteria,
                context=test_case.input_data,
            )
            
            self.results.append(report)
        
        return self.get_summary()
    
    def get_summary(self) -> Dict[str, Any]:
        """Get summary of evaluation results."""
        if not self.results:
            return {"status": "no_results"}
        
        total_score = sum(r.overall_score for r in self.results)
        avg_score = total_score / len(self.results)
        passed_count = sum(1 for r in self.results if r.passed)
        
        # Check for regression
        regression_detected = False
        if self.baseline_scores:
            for criterion in EvalCriterion:
                criterion_scores = [
                    result.score
                    for report in self.results
                    for result in report.results
                    if result.criterion == criterion
                ]
                if criterion_scores:
                    current_avg = sum(criterion_scores) / len(criterion_scores)
                    baseline = self.baseline_scores.get(criterion.value, current_avg)
                    if current_avg < baseline * (1 - self.regression_threshold):
                        regression_detected = True
                        break
        
        return {
            "status": "completed",
            "total_cases": len(self.results),
            "passed_cases": passed_count,
            "failed_cases": len(self.results) - passed_count,
            "pass_rate": passed_count / len(self.results),
            "average_score": round(avg_score, 2),
            "regression_detected": regression_detected,
            "ci_should_fail": regression_detected or passed_count < len(self.results),
            "results": [r.to_dict() for r in self.results],
        }
    
    def save_baseline(self) -> Dict[str, float]:
        """Save current scores as baseline for future regression testing."""
        baseline = {}
        for criterion in EvalCriterion:
            scores = [
                result.score
                for report in self.results
                for result in report.results
                if result.criterion == criterion
            ]
            if scores:
                baseline[criterion.value] = sum(scores) / len(scores)
        
        self.baseline_scores = baseline
        return baseline


def create_default_dataset() -> EvalDataset:
    """Create a default evaluation dataset with sample test cases."""
    dataset = EvalDataset(
        name="manoe_default_evals",
        description="Default evaluation dataset for MANOE story generation",
    )
    
    # Test case 1: Simple scene generation
    dataset.add_case(TestCase(
        id="scene_simple_1",
        name="Simple Dialogue Scene",
        input_data={
            "scene_type": "dialogue",
            "characters": ["Alice", "Bob"],
            "setting": "Coffee shop",
            "conflict": "Alice reveals a secret",
            "emotional_beat": "tension building to revelation",
        },
        criteria=[
            EvalCriterion.COHERENCE,
            EvalCriterion.STYLE,
            EvalCriterion.CHARACTER_CONSISTENCY,
        ],
        metadata={"content_type": "scene", "difficulty": "easy"},
    ))
    
    # Test case 2: Action scene
    dataset.add_case(TestCase(
        id="scene_action_1",
        name="Action Sequence",
        input_data={
            "scene_type": "action",
            "characters": ["Hero", "Villain"],
            "setting": "Abandoned warehouse",
            "conflict": "Final confrontation",
            "emotional_beat": "climactic tension",
        },
        criteria=[
            EvalCriterion.COHERENCE,
            EvalCriterion.PACING,
            EvalCriterion.EMOTIONAL_IMPACT,
        ],
        metadata={"content_type": "scene", "difficulty": "medium"},
    ))
    
    # Test case 3: Emotional scene
    dataset.add_case(TestCase(
        id="scene_emotional_1",
        name="Emotional Revelation",
        input_data={
            "scene_type": "emotional",
            "characters": ["Parent", "Child"],
            "setting": "Hospital room",
            "conflict": "Saying goodbye",
            "emotional_beat": "grief and acceptance",
        },
        criteria=[
            EvalCriterion.EMOTIONAL_IMPACT,
            EvalCriterion.CHARACTER_CONSISTENCY,
            EvalCriterion.STYLE,
        ],
        metadata={"content_type": "scene", "difficulty": "hard"},
    ))
    
    return dataset
