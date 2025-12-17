"""
Unit tests for the Evals Framework implementation.

Tests cover:
- EvalCriterion enum values
- EvalCriteria configuration
- EvalResult creation
- EvalReport creation and serialization
- TestCase and EvalDataset management
- LLMJudge evaluation (mocked)
- EvalRunner dataset evaluation
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime
from core.evals import (
    EvalCriterion,
    EvalCriteria,
    EvalResult,
    EvalReport,
    TestCase,
    EvalDataset,
    LLMJudge,
    EvalRunner,
    create_default_dataset,
)


class TestEvalCriterion:
    """Tests for EvalCriterion enum."""

    def test_criterion_values(self):
        """Test that all expected criterion values exist."""
        assert EvalCriterion.COHERENCE.value == "coherence"
        assert EvalCriterion.STYLE.value == "style"
        assert EvalCriterion.INSTRUCTION_FOLLOWING.value == "instruction_following"
        assert EvalCriterion.CHARACTER_CONSISTENCY.value == "character_consistency"
        assert EvalCriterion.WORLD_CONSISTENCY.value == "world_consistency"
        assert EvalCriterion.EMOTIONAL_IMPACT.value == "emotional_impact"
        assert EvalCriterion.ORIGINALITY.value == "originality"
        assert EvalCriterion.PACING.value == "pacing"


class TestEvalCriteria:
    """Tests for EvalCriteria class."""

    def test_create_criteria(self):
        """Test creating evaluation criteria."""
        criteria = EvalCriteria(
            criterion=EvalCriterion.COHERENCE,
            weight=1.5,
            threshold=7.0,
            description="Test coherence",
            rubric="10: Perfect\n5: Average\n1: Poor",
        )
        
        assert criteria.criterion == EvalCriterion.COHERENCE
        assert criteria.weight == 1.5
        assert criteria.threshold == 7.0
        assert criteria.description == "Test coherence"
        assert "Perfect" in criteria.rubric

    def test_default_values(self):
        """Test default values for criteria."""
        criteria = EvalCriteria(criterion=EvalCriterion.STYLE)
        
        assert criteria.weight == 1.0
        assert criteria.threshold == 7.0
        assert criteria.description == ""
        assert criteria.rubric == ""


class TestEvalResult:
    """Tests for EvalResult class."""

    def test_create_result(self):
        """Test creating an evaluation result."""
        result = EvalResult(
            criterion=EvalCriterion.COHERENCE,
            score=8.5,
            feedback="Good logical flow",
            passed=True,
            metadata={"reviewer": "gpt-4"},
        )
        
        assert result.criterion == EvalCriterion.COHERENCE
        assert result.score == 8.5
        assert result.feedback == "Good logical flow"
        assert result.passed is True
        assert result.metadata["reviewer"] == "gpt-4"

    def test_failed_result(self):
        """Test creating a failed result."""
        result = EvalResult(
            criterion=EvalCriterion.STYLE,
            score=4.0,
            feedback="Inconsistent voice",
            passed=False,
        )
        
        assert result.passed is False
        assert result.score == 4.0


class TestEvalReport:
    """Tests for EvalReport class."""

    def test_create_report(self):
        """Test creating an evaluation report."""
        results = [
            EvalResult(
                criterion=EvalCriterion.COHERENCE,
                score=8.0,
                feedback="Good",
                passed=True,
            ),
            EvalResult(
                criterion=EvalCriterion.STYLE,
                score=7.5,
                feedback="Decent",
                passed=True,
            ),
        ]
        
        report = EvalReport(
            content_id="scene_1",
            content_type="scene",
            overall_score=7.75,
            passed=True,
            results=results,
            judge_model="gpt-4",
            latency_ms=1500.0,
        )
        
        assert report.content_id == "scene_1"
        assert report.content_type == "scene"
        assert report.overall_score == 7.75
        assert report.passed is True
        assert len(report.results) == 2
        assert report.judge_model == "gpt-4"

    def test_to_dict(self):
        """Test converting report to dictionary."""
        results = [
            EvalResult(
                criterion=EvalCriterion.COHERENCE,
                score=8.0,
                feedback="Good",
                passed=True,
            ),
        ]
        
        report = EvalReport(
            content_id="scene_1",
            content_type="scene",
            overall_score=8.0,
            passed=True,
            results=results,
            judge_model="gpt-4",
        )
        
        report_dict = report.to_dict()
        
        assert report_dict["content_id"] == "scene_1"
        assert report_dict["content_type"] == "scene"
        assert report_dict["overall_score"] == 8.0
        assert report_dict["passed"] is True
        assert len(report_dict["results"]) == 1
        assert report_dict["results"][0]["criterion"] == "coherence"


class TestTestCase:
    """Tests for TestCase class."""

    def test_create_test_case(self):
        """Test creating a test case."""
        case = TestCase(
            id="test_1",
            name="Simple Scene Test",
            input_data={
                "scene_type": "dialogue",
                "characters": ["Alice", "Bob"],
            },
            expected_output="A dialogue scene",
            criteria=[EvalCriterion.COHERENCE, EvalCriterion.STYLE],
            metadata={"difficulty": "easy"},
        )
        
        assert case.id == "test_1"
        assert case.name == "Simple Scene Test"
        assert case.input_data["scene_type"] == "dialogue"
        assert case.expected_output == "A dialogue scene"
        assert len(case.criteria) == 2
        assert case.metadata["difficulty"] == "easy"


class TestEvalDataset:
    """Tests for EvalDataset class."""

    def test_create_dataset(self):
        """Test creating an evaluation dataset."""
        dataset = EvalDataset(
            name="test_dataset",
            description="Test dataset for evaluation",
            version="1.0",
        )
        
        assert dataset.name == "test_dataset"
        assert dataset.description == "Test dataset for evaluation"
        assert dataset.version == "1.0"
        assert len(dataset.test_cases) == 0

    def test_add_case(self):
        """Test adding a test case to dataset."""
        dataset = EvalDataset(
            name="test_dataset",
            description="Test dataset",
        )
        
        case = TestCase(
            id="test_1",
            name="Test Case 1",
            input_data={"key": "value"},
        )
        
        dataset.add_case(case)
        
        assert len(dataset.test_cases) == 1
        assert dataset.test_cases[0].id == "test_1"

    def test_to_dict(self):
        """Test converting dataset to dictionary."""
        dataset = EvalDataset(
            name="test_dataset",
            description="Test dataset",
        )
        
        dataset.add_case(TestCase(
            id="test_1",
            name="Test Case 1",
            input_data={"key": "value"},
            criteria=[EvalCriterion.COHERENCE],
        ))
        
        dataset_dict = dataset.to_dict()
        
        assert dataset_dict["name"] == "test_dataset"
        assert dataset_dict["description"] == "Test dataset"
        assert len(dataset_dict["test_cases"]) == 1
        assert dataset_dict["test_cases"][0]["id"] == "test_1"

    def test_from_dict(self):
        """Test creating dataset from dictionary."""
        data = {
            "name": "restored_dataset",
            "description": "Restored from dict",
            "version": "2.0",
            "test_cases": [
                {
                    "id": "test_1",
                    "name": "Test Case 1",
                    "input_data": {"key": "value"},
                    "expected_output": None,
                    "criteria": ["coherence", "style"],
                    "metadata": {},
                },
            ],
        }
        
        dataset = EvalDataset.from_dict(data)
        
        assert dataset.name == "restored_dataset"
        assert dataset.version == "2.0"
        assert len(dataset.test_cases) == 1
        assert dataset.test_cases[0].id == "test_1"
        assert EvalCriterion.COHERENCE in dataset.test_cases[0].criteria


class TestLLMJudge:
    """Tests for LLMJudge class."""

    def test_create_judge(self):
        """Test creating an LLM judge."""
        judge = LLMJudge(
            model_client=None,
            judge_model="gpt-4",
            judge_provider="openai",
        )
        
        assert judge.judge_model == "gpt-4"
        assert judge.judge_provider == "openai"
        assert len(judge.criteria) > 0  # Default criteria

    def test_default_criteria(self):
        """Test that default criteria are set."""
        judge = LLMJudge()
        
        criteria_names = [c.criterion for c in judge.criteria]
        
        assert EvalCriterion.COHERENCE in criteria_names
        assert EvalCriterion.STYLE in criteria_names
        assert EvalCriterion.INSTRUCTION_FOLLOWING in criteria_names

    @pytest.mark.asyncio
    async def test_evaluate_without_model_client(self):
        """Test evaluation without model client uses mock."""
        judge = LLMJudge(model_client=None)
        
        report = await judge.evaluate(
            content="This is a test scene with dialogue.",
            content_type="scene",
            content_id="test_scene_1",
        )
        
        assert report.content_id == "test_scene_1"
        assert report.content_type == "scene"
        assert report.overall_score > 0
        assert len(report.results) > 0

    def test_mock_evaluation(self):
        """Test mock evaluation generation."""
        judge = LLMJudge()
        
        mock_data = judge._mock_evaluation(judge.criteria)
        
        assert "evaluations" in mock_data
        assert "overall_feedback" in mock_data
        assert len(mock_data["evaluations"]) == len(judge.criteria)

    def test_build_eval_prompt(self):
        """Test building evaluation prompt."""
        judge = LLMJudge()
        
        prompt = judge._build_eval_prompt(
            content="Test content",
            content_type="scene",
            criteria=judge.criteria[:2],
            context={"setting": "coffee shop"},
        )
        
        assert "Test content" in prompt
        assert "scene" in prompt
        assert "COHERENCE" in prompt
        assert "coffee shop" in prompt


class TestEvalRunner:
    """Tests for EvalRunner class."""

    def test_create_runner(self):
        """Test creating an eval runner."""
        judge = LLMJudge()
        runner = EvalRunner(
            judge=judge,
            baseline_scores={"coherence": 7.5},
            regression_threshold=0.05,
        )
        
        assert runner.judge == judge
        assert runner.baseline_scores["coherence"] == 7.5
        assert runner.regression_threshold == 0.05

    def test_get_summary_no_results(self):
        """Test getting summary with no results."""
        judge = LLMJudge()
        runner = EvalRunner(judge=judge)
        
        summary = runner.get_summary()
        
        assert summary["status"] == "no_results"

    @pytest.mark.asyncio
    async def test_run_dataset(self):
        """Test running evaluation on a dataset."""
        judge = LLMJudge(model_client=None)
        runner = EvalRunner(judge=judge)
        
        dataset = EvalDataset(
            name="test_dataset",
            description="Test",
        )
        dataset.add_case(TestCase(
            id="test_1",
            name="Test 1",
            input_data={"prompt": "Write a scene"},
            metadata={"content_type": "scene"},
        ))
        
        def generator(input_data):
            return "Generated scene content based on: " + str(input_data)
        
        summary = await runner.run_dataset(dataset, generator)
        
        assert summary["status"] == "completed"
        assert summary["total_cases"] == 1
        assert "average_score" in summary

    def test_save_baseline(self):
        """Test saving baseline scores."""
        judge = LLMJudge()
        runner = EvalRunner(judge=judge)
        
        # Add some mock results
        runner.results = [
            EvalReport(
                content_id="test_1",
                content_type="scene",
                overall_score=8.0,
                passed=True,
                results=[
                    EvalResult(
                        criterion=EvalCriterion.COHERENCE,
                        score=8.0,
                        feedback="Good",
                        passed=True,
                    ),
                ],
            ),
        ]
        
        baseline = runner.save_baseline()
        
        assert "coherence" in baseline
        assert baseline["coherence"] == 8.0


class TestCreateDefaultDataset:
    """Tests for create_default_dataset function."""

    def test_create_default_dataset(self):
        """Test creating the default evaluation dataset."""
        dataset = create_default_dataset()
        
        assert dataset.name == "manoe_default_evals"
        assert len(dataset.test_cases) >= 3  # At least 3 test cases
        
        # Check that test cases have expected structure
        for case in dataset.test_cases:
            assert case.id is not None
            assert case.name is not None
            assert "scene_type" in case.input_data
            assert len(case.criteria) > 0
